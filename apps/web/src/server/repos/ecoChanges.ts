import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  bomRevision,
  bomTemplate,
  ecoChange,
  ecoLine,
  salesOrder,
  type EcoChange,
  type EcoLine,
  type EcoStatus,
} from "@iot/db/schema";
// bomLine tree merge là V1.3+ (V1.3 chỉ modify frozen_snapshot JSON).
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V1.3 Phase B4 — ECO (Engineering Change Order) repository.
 *
 * State machine: DRAFT → SUBMITTED → APPROVED → APPLIED
 *                            ↓         ↓
 *                         REJECTED
 *
 * Workflow:
 *  - createECO (DRAFT) + lines
 *  - updateECO (DRAFT only) — sửa lines/metadata
 *  - submitECO (DRAFT → SUBMITTED)
 *  - approveECO (SUBMITTED → APPROVED) + clone revision DRAFT (admin)
 *  - rejectECO (SUBMITTED/APPROVED → REJECTED) với reason
 *  - applyECO (APPROVED → APPLIED) merge eco_lines vào new revision JSON +
 *    supersede old + count affected orders. Sync ≤ 10 orders, async > 10 (worker).
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

export type EcoLineAction =
  | "ADD_LINE"
  | "REMOVE_LINE"
  | "UPDATE_QTY"
  | "UPDATE_SCRAP"
  | "REPLACE_COMPONENT";

export interface CreateEcoInput {
  title: string;
  description?: string | null;
  affectedTemplateId: string;
  oldRevisionId?: string | null;
  lines: Array<{
    action: EcoLineAction;
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
          qtyPerParent:
            l.qtyPerParent !== null && l.qtyPerParent !== undefined
              ? String(l.qtyPerParent)
              : null,
          scrapPercent:
            l.scrapPercent !== null && l.scrapPercent !== undefined
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

export interface UpdateEcoInput {
  title?: string;
  description?: string | null;
  lines?: CreateEcoInput["lines"];
}

export async function updateECO(
  id: string,
  patch: UpdateEcoInput,
): Promise<EcoChange> {
  return db.transaction(async (tx) => {
    const [eco] = await tx
      .select()
      .from(ecoChange)
      .where(eq(ecoChange.id, id))
      .limit(1);
    if (!eco) throw new EcoError("ECO không tồn tại", "NOT_FOUND", 404);
    if (eco.status !== "DRAFT") {
      throw new EcoError(
        `ECO phải DRAFT mới sửa được, đang ${eco.status}`,
        "INVALID_STATUS",
        422,
      );
    }

    const setVals: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) setVals.title = patch.title;
    if (patch.description !== undefined)
      setVals.description = patch.description;

    const [updated] = await tx
      .update(ecoChange)
      .set(setVals)
      .where(eq(ecoChange.id, id))
      .returning();
    if (!updated) throw new Error("ECO_UPDATE_FAILED");

    if (patch.lines !== undefined) {
      await tx.delete(ecoLine).where(eq(ecoLine.ecoId, id));
      if (patch.lines.length > 0) {
        await tx.insert(ecoLine).values(
          patch.lines.map((l, i) => ({
            ecoId: id,
            action: l.action,
            targetLineId: l.targetLineId ?? null,
            componentItemId: l.componentItemId ?? null,
            qtyPerParent:
              l.qtyPerParent !== null && l.qtyPerParent !== undefined
                ? String(l.qtyPerParent)
                : null,
            scrapPercent:
              l.scrapPercent !== null && l.scrapPercent !== undefined
                ? String(l.scrapPercent)
                : null,
            description: l.description ?? null,
            position: i,
          })),
        );
      }
    }

    return updated;
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

export async function submitECO(
  id: string,
  userId: string | null,
): Promise<EcoChange> {
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

    let newRevisionId: string | null = null;
    if (eco.oldRevisionId) {
      const [oldRev] = await tx
        .select()
        .from(bomRevision)
        .where(eq(bomRevision.id, eco.oldRevisionId))
        .limit(1);
      if (oldRev) {
        const nextNo = /^R\d+$/i.test(oldRev.revisionNo)
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

interface FrozenSnapshotNode {
  id?: string;
  parentLineId?: string | null;
  componentItemId?: string;
  level?: number;
  qtyPerParent?: number | string;
  scrapPercent?: number | string;
  position?: number;
  /** Legacy: một số snapshot cũ có thể còn field này — không dùng ở flat format. */
  children?: FrozenSnapshotNode[];
  [key: string]: unknown;
}

interface FrozenSnapshot {
  lines?: FrozenSnapshotNode[];
  [key: string]: unknown;
}

/**
 * Merge 1 eco_line change vào frozen_snapshot JSON. In-place update.
 *
 * V3.11.4 (audit 1.31) — frozen_snapshot là format FLAT (`lines[]` với
 * `parentLineId` + `level`, KHÔNG có `children` lồng — xem createBomRevision +
 * explodeSnapshot). Trước đây hàm này thao tác trên format CÂY (`n.children`)
 * nên: (a) UPDATE/REMOVE không tìm thấy line con (flat không có children);
 * (b) ADD_LINE tạo node thiếu `parentLineId`/`level` → explode revision sau ECO
 * bị insert vỡ NOT NULL / tính sai cây. Nay xử lý đúng trên flat + REMOVE xoá
 * cả subtree tránh orphan.
 */
function applyEcoLineToSnapshot(snap: FrozenSnapshot, line: EcoLine): void {
  if (!snap.lines) snap.lines = [];
  const lines = snap.lines;

  // ADD_LINE — thêm node flat với đủ parentLineId + level.
  if (line.action === "ADD_LINE") {
    // Review 2A-fix — GUARD: ADD_LINE bắt buộc phải có componentItemId. Nếu thiếu
    // (eco_line.component_item_id nullable + zod create không refine), node sẽ có
    // componentItemId=undefined → JSON.stringify bỏ key → frozen_snapshot "độc":
    // explodeSnapshot map componentIds chứa undefined → ANY(()) SQL lỗi / compMap
    // .get(undefined) throw → MỌI order explode trên revision đó vỡ. Bỏ qua node
    // vô nghĩa này thay vì đầu độc snapshot.
    if (!line.componentItemId) return;
    // parent = targetLineId (thêm làm con của target) hoặc null (root).
    const parent = line.targetLineId
      ? lines.find((n) => n.id === line.targetLineId)
      : undefined;
    const parentLevel =
      parent && typeof parent.level === "number" ? parent.level : 0;
    lines.push({
      id: `eco-${line.id}`,
      parentLineId: line.targetLineId ?? null,
      componentItemId: line.componentItemId,
      level: parentLevel + 1,
      qtyPerParent:
        line.qtyPerParent !== null ? String(line.qtyPerParent) : "1",
      scrapPercent:
        line.scrapPercent !== null ? String(line.scrapPercent) : "0",
      position: lines.length + 1,
    });
    return;
  }

  if (!line.targetLineId) return;

  // REMOVE_LINE — xoá node target + toàn bộ subtree (con/cháu) theo parentLineId.
  if (line.action === "REMOVE_LINE") {
    const toRemove = new Set<string>([line.targetLineId]);
    // Lan truyền: mọi node có parent nằm trong toRemove cũng bị xoá.
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of lines) {
        const pid = (n.parentLineId as string | null | undefined) ?? null;
        if (
          typeof n.id === "string" &&
          pid !== null &&
          toRemove.has(pid) &&
          !toRemove.has(n.id)
        ) {
          toRemove.add(n.id);
          grew = true;
        }
      }
    }
    snap.lines = lines.filter(
      (n) => typeof n.id !== "string" || !toRemove.has(n.id),
    );
    return;
  }

  // UPDATE_QTY / UPDATE_SCRAP / REPLACE_COMPONENT — sửa field trên node target.
  const target = lines.find((n) => n.id === line.targetLineId);
  if (!target) return;
  if (line.action === "UPDATE_QTY" && line.qtyPerParent !== null) {
    target.qtyPerParent = String(line.qtyPerParent);
  } else if (line.action === "UPDATE_SCRAP" && line.scrapPercent !== null) {
    target.scrapPercent = String(line.scrapPercent);
  } else if (line.action === "REPLACE_COMPONENT" && line.componentItemId) {
    target.componentItemId = line.componentItemId;
  }
}

export async function countAffectedOrders(
  templateId: string,
): Promise<number> {
  const cntRows = (await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM app.sales_order
    WHERE bom_template_id = ${templateId}
      AND status NOT IN ('CLOSED','CANCELLED','FULFILLED')
  `)) as unknown as Array<{ cnt: number }>;
  return cntRows[0]?.cnt ?? 0;
}

/**
 * Apply ECO: merge eco_lines vào frozen_snapshot của new revision + supersede
 * old revision. Nếu > 10 affected orders → enqueue BullMQ async.
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

    const cntRows = (await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM app.sales_order
      WHERE bom_template_id = ${eco.affectedTemplateId}
        AND status NOT IN ('CLOSED','CANCELLED','FULFILLED')
    `)) as unknown as Array<{ cnt: number }>;
    const affectedCount = cntRows[0]?.cnt ?? 0;
    const syncMode = affectedCount <= 10;

    // Load eco_lines để merge vào new revision frozen_snapshot
    const ecoLines = await tx
      .select()
      .from(ecoLine)
      .where(eq(ecoLine.ecoId, id))
      .orderBy(asc(ecoLine.position));

    // Merge JSON frozen_snapshot của new revision
    if (eco.newRevisionId) {
      const [newRev] = await tx
        .select()
        .from(bomRevision)
        .where(eq(bomRevision.id, eco.newRevisionId))
        .limit(1);
      if (newRev) {
        const snap =
          (newRev.frozenSnapshot as unknown as FrozenSnapshot) ?? {
            lines: [],
          };
        for (const l of ecoLines) applyEcoLineToSnapshot(snap, l);
        await tx
          .update(bomRevision)
          .set({
            frozenSnapshot: snap as unknown as Record<string, unknown>,
            status: "RELEASED",
            releasedAt: new Date(),
            releasedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(bomRevision.id, eco.newRevisionId));
      }
    }

    if (eco.oldRevisionId) {
      await tx
        .update(bomRevision)
        .set({ status: "SUPERSEDED", updatedAt: new Date() })
        .where(eq(bomRevision.id, eco.oldRevisionId));
    }

    const [updated] = await tx
      .update(ecoChange)
      .set({
        status: "APPLIED",
        appliedAt: new Date(),
        appliedBy: userId,
        affectedOrdersCount: affectedCount,
        applyProgress: syncMode ? 100 : 0,
        applyJobId: syncMode ? null : null, // sẽ set ở route handler nếu async
        updatedAt: new Date(),
      })
      .where(eq(ecoChange.id, id))
      .returning();
    if (!updated) throw new Error("ECO_APPLY_FAILED");

    // Flag metadata.requires_review cho affected orders (sync)
    if (syncMode && affectedCount > 0) {
      await tx.execute(sql`
        UPDATE app.sales_order
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{requires_review}', 'true'::jsonb
        )
        WHERE bom_template_id = ${eco.affectedTemplateId}
          AND status NOT IN ('CLOSED','CANCELLED','FULFILLED')
      `);
    }

    logger.info(
      { ecoId: id, affectedCount, syncMode },
      "ECO applied",
    );

    return { ...updated, affectedOrdersCount: affectedCount, syncMode };
  });
}

export interface EcoListQuery {
  q?: string;
  status?: EcoStatus[];
  /** V1.6 — filter ECO theo BOM template (FK direct: eco_change.affected_template_id). */
  bomTemplateId?: string;
  page: number;
  pageSize: number;
}

export async function listECO(q: EcoListQuery): Promise<{
  rows: (EcoChange & { templateCode: string | null })[];
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
    const search = or(
      ilike(ecoChange.code, needle),
      ilike(ecoChange.title, needle),
    );
    if (search) where.push(search);
  }
  if (q.bomTemplateId) {
    where.push(eq(ecoChange.affectedTemplateId, q.bomTemplateId));
  }
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [total, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(ecoChange)
      .where(whereExpr),
    db
      .select({ eco: ecoChange, templateCode: bomTemplate.code })
      .from(ecoChange)
      .leftJoin(bomTemplate, eq(bomTemplate.id, ecoChange.affectedTemplateId))
      .where(whereExpr)
      .orderBy(desc(ecoChange.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) => ({ ...r.eco, templateCode: r.templateCode ?? null })),
    total: total[0]?.count ?? 0,
  };
}

export async function getECOByCode(code: string): Promise<
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
    .where(eq(ecoChange.code, code))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select()
    .from(ecoLine)
    .where(eq(ecoLine.ecoId, row.eco.id))
    .orderBy(asc(ecoLine.position));
  return { ...row.eco, templateCode: row.templateCode ?? null, lines };
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
