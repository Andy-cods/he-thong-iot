import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  bomLine,
  bomRevision,
  bomTemplate,
  ecoChange,
  ecoLine,
  salesOrder,
  type EcoChange,
  type EcoLine,
  type EcoStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V1.3 ECO (Engineering Change Order) repository — skeleton cho Phase B4.
 *
 * State machine: DRAFT → SUBMITTED → APPROVED → APPLIED
 *                            ↓
 *                         REJECTED
 *
 * approveECO → clone current revision thành new revision DRAFT.
 * applyECO → merge eco_lines vào new revision, supersede old revision,
 *            count affected orders, enqueue BullMQ nếu > 10.
 */

export class EcoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

const ALLOWED: Record<EcoStatus, EcoStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["APPLIED", "REJECTED"],
  APPLIED: [],
  REJECTED: [],
};

export interface CreateEcoInput {
  title: string;
  description?: string | null;
  affectedTemplateId: string;
  oldRevisionId?: string | null;
  lines: Array<{
    action: "ADD_LINE" | "REMOVE_LINE" | "UPDATE_QTY" | "UPDATE_SCRAP" | "REPLACE_COMPONENT";
    targetLineId?: string | null;
    componentItemId?: string | null;
    qtyPerParent?: number | null;
    scrapPercent?: number | null;
    description?: string | null;
  }>;
  userId: string | null;
}

export async function createECO(input: CreateEcoInput): Promise<EcoChange> {
  return db.transaction(async (tx) => {
    // Gen code ECO-YYMM-####
    const cntRows = (await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM app.eco_change
      WHERE to_char(created_at, 'YYMM') = to_char(now(), 'YYMM')
    `)) as unknown as Array<{ cnt: number }>;
    const cnt = cntRows[0]?.cnt ?? 0;
    const code = `ECO-${new Date()
      .toISOString()
      .slice(2, 7)
      .replace("-", "")}-${String(cnt + 1).padStart(4, "0")}`;

    const [eco] = await tx
      .insert(ecoChange)
      .values({
        code,
        title: input.title,
        description: input.description ?? null,
        affectedTemplateId: input.affectedTemplateId,
        oldRevisionId: input.oldRevisionId ?? null,
        status: "DRAFT",
        requestedBy: input.userId,
      })
      .returning();
    if (!eco) throw new Error("ECO_INSERT_FAILED");

    if (input.lines.length > 0) {
      await tx.insert(ecoLine).values(
        input.lines.map((l, i) => ({
          ecoId: eco.id,
          action: l.action,
          targetLineId: l.targetLineId ?? null,
          componentItemId: l.componentItemId ?? null,
          qtyPerParent: l.qtyPerParent !== null && l.qtyPerParent !== undefined
            ? String(l.qtyPerParent)
            : null,
          scrapPercent: l.scrapPercent !== null && l.scrapPercent !== undefined
            ? String(l.scrapPercent)
            : null,
          description: l.description ?? null,
          position: i,
        })),
      );
    }

    logger.info({ ecoId: eco.id, code }, "ECO created");
    return eco;
  });
}

async function transitionEco(
  id: string,
  toStatus: EcoStatus,
  fields: Record<string, unknown>,
): Promise<EcoChange> {
  const [cur] = await db
    .select({ status: ecoChange.status })
    .from(ecoChange)
    .where(eq(ecoChange.id, id))
    .limit(1);
  if (!cur) throw new EcoError("ECO không tồn tại", "NOT_FOUND", 404);
  if (!ALLOWED[cur.status].includes(toStatus)) {
    throw new EcoError(
      `Không thể transition ${cur.status} → ${toStatus}`,
      "INVALID_TRANSITION",
      422,
    );
  }
  const rows = await db
    .update(ecoChange)
    .set({ status: toStatus, ...fields, updatedAt: new Date() })
    .where(eq(ecoChange.id, id))
    .returning();
  const first = rows[0];
  if (!first) throw new Error("ECO_UPDATE_FAILED");
  return first;
}

export async function submitECO(id: string, userId: string | null): Promise<EcoChange> {
  return transitionEco(id, "SUBMITTED", {
    submittedAt: new Date(),
    requestedBy: userId,
  });
}

export async function rejectECO(
  id: string,
  reason: string,
  userId: string | null,
): Promise<EcoChange> {
  return transitionEco(id, "REJECTED", {
    rejectedAt: new Date(),
    rejectedBy: userId,
    rejectedReason: reason,
  });
}

/**
 * Approve ECO: clone current revision → new revision DRAFT. Set new_revision_id.
 * Clone frozen_snapshot JSON; delta apply ở applyECO step.
 */
export async function approveECO(
  id: string,
  userId: string | null,
): Promise<EcoChange> {
  return db.transaction(async (tx) => {
    const [eco] = await tx
      .select()
      .from(ecoChange)
      .where(eq(ecoChange.id, id))
      .limit(1);
    if (!eco) throw new EcoError("ECO không tồn tại", "NOT_FOUND", 404);
    if (eco.status !== "SUBMITTED") {
      throw new EcoError(
        `ECO phải SUBMITTED, đang ${eco.status}`,
        "INVALID_TRANSITION",
        422,
      );
    }

    // Clone old revision (nếu có) → new revision DRAFT
    let newRevisionId: string | null = null;
    if (eco.oldRevisionId) {
      const [oldRev] = await tx
        .select()
        .from(bomRevision)
        .where(eq(bomRevision.id, eco.oldRevisionId))
        .limit(1);
      if (oldRev) {
        // Revision no: tăng numeric suffix nếu pattern "R1/R2"; else append "-ECO"
        const nextNo =
          /^R\d+$/i.test(oldRev.revisionNo)
            ? `R${Number(oldRev.revisionNo.slice(1)) + 1}`
            : `${oldRev.revisionNo}-ECO-${eco.code}`;
        const [newRev] = await tx
          .insert(bomRevision)
          .values({
            templateId: oldRev.templateId,
            revisionNo: nextNo,
            status: "DRAFT",
            frozenSnapshot: oldRev.frozenSnapshot,
            notes: `Clone từ ECO ${eco.code}: ${eco.title}`,
          })
          .returning();
        newRevisionId = newRev?.id ?? null;
      }
    }

    const [updated] = await tx
      .update(ecoChange)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: userId,
        newRevisionId,
        updatedAt: new Date(),
      })
      .where(and(eq(ecoChange.id, id), eq(ecoChange.status, "SUBMITTED")))
      .returning();
    if (!updated) throw new Error("ECO_APPROVE_FAILED");

    logger.info(
      { ecoId: id, newRevisionId },
      "ECO approved + revision cloned",
    );
    return updated;
  });
}

/**
 * Apply ECO: merge eco_lines vào new revision + supersede old + count affected orders.
 * V1.3 sync < 10 orders, async >= 10 (stub chưa enqueue BullMQ — field apply_job_id sẵn sàng).
 */
export async function applyECO(
  id: string,
  userId: string | null,
): Promise<EcoChange & { affectedOrdersCount: number; syncMode: boolean }> {
  return db.transaction(async (tx) => {
    const [eco] = await tx
      .select()
      .from(ecoChange)
      .where(eq(ecoChange.id, id))
      .limit(1);
    if (!eco) throw new EcoError("ECO không tồn tại", "NOT_FOUND", 404);
    if (eco.status !== "APPROVED") {
      throw new EcoError(
        `ECO phải APPROVED, đang ${eco.status}`,
        "INVALID_TRANSITION",
        422,
      );
    }

    // Count affected orders: sales_order.bom_template_id = eco.affected_template_id
    // và status không CLOSED
    const cntRows = (await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM app.sales_order
      WHERE bom_template_id = ${eco.affectedTemplateId}
        AND status NOT IN ('CLOSED','CANCELLED','FULFILLED')
    `)) as unknown as Array<{ cnt: number }>;
    const affectedCount = cntRows[0]?.cnt ?? 0;
    const syncMode = affectedCount < 10;

    // Supersede old revision + release new revision
    if (eco.oldRevisionId) {
      await tx
        .update(bomRevision)
        .set({ status: "SUPERSEDED" })
        .where(eq(bomRevision.id, eco.oldRevisionId));
    }
    if (eco.newRevisionId) {
      await tx
        .update(bomRevision)
        .set({ status: "RELEASED" })
        .where(eq(bomRevision.id, eco.newRevisionId));
    }

    // V1.3: stub — chưa thực sự merge eco_lines vào bom_line của new revision.
    // Scope cook B4 sẽ implement full merge. Ở đây chỉ đánh dấu trạng thái.

    const [updated] = await tx
      .update(ecoChange)
      .set({
        status: "APPLIED",
        appliedAt: new Date(),
        appliedBy: userId,
        affectedOrdersCount: affectedCount,
        applyProgress: syncMode ? 100 : 0,
        applyJobId: syncMode ? null : `bull-${id}`,
        updatedAt: new Date(),
      })
      .where(eq(ecoChange.id, id))
      .returning();
    if (!updated) throw new Error("ECO_APPLY_FAILED");

    logger.info(
      { ecoId: id, affectedCount, syncMode },
      "ECO applied",
    );

    return {
      ...updated,
      affectedOrdersCount: affectedCount,
      syncMode,
    };
  });
}

export interface EcoListQuery {
  q?: string;
  status?: EcoStatus[];
  page: number;
  pageSize: number;
}

export async function listECO(q: EcoListQuery): Promise<{
  rows: EcoChange[];
  total: number;
}> {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        ecoChange.status,
        q.status as unknown as (typeof ecoChange.status.enumValues)[number][],
      ),
    );
  }
  if (q.q && q.q.trim().length > 0) {
    const needle = `%${q.q.trim()}%`;
    const search = or(ilike(ecoChange.code, needle), ilike(ecoChange.title, needle));
    if (search) where.push(search);
  }
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [total, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(ecoChange)
      .where(whereExpr),
    db
      .select()
      .from(ecoChange)
      .where(whereExpr)
      .orderBy(desc(ecoChange.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return { rows, total: total[0]?.count ?? 0 };
}

export async function getECO(id: string): Promise<
  | (EcoChange & {
      lines: EcoLine[];
      templateCode: string | null;
    })
  | null
> {
  const [row] = await db
    .select({
      eco: ecoChange,
      templateCode: bomTemplate.code,
    })
    .from(ecoChange)
    .leftJoin(bomTemplate, eq(bomTemplate.id, ecoChange.affectedTemplateId))
    .where(eq(ecoChange.id, id))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select()
    .from(ecoLine)
    .where(eq(ecoLine.ecoId, id))
    .orderBy(asc(ecoLine.position));
  return { ...row.eco, templateCode: row.templateCode ?? null, lines };
}

export async function getAffectedOrders(templateId: string) {
  return db
    .select({
      id: salesOrder.id,
      orderNo: salesOrder.orderNo,
      customerName: salesOrder.customerName,
      status: salesOrder.status,
    })
    .from(salesOrder)
    .where(
      and(
        eq(salesOrder.bomTemplateId, templateId),
        sql`${salesOrder.status} NOT IN ('CLOSED','CANCELLED','FULFILLED')`,
      ),
    );
}
