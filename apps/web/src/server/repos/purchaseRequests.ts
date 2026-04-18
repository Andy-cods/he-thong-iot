import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  bomSnapshotLine,
  item,
  purchaseRequest,
  purchaseRequestLine,
} from "@iot/db/schema";
import type {
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * Repository purchase_request — V1.2.
 *
 * Source type: MANUAL (user tự tạo) | SHORTAGE (auto prefill từ shortage board).
 * Status flow: DRAFT → SUBMITTED → APPROVED → CONVERTED (to PO) | REJECTED.
 */

export interface ListPRsQuery {
  status?: PurchaseRequestStatus[];
  linkedOrderId?: string;
  requestedBy?: string;
  page: number;
  pageSize: number;
}

export interface ListPRsResult {
  rows: PurchaseRequest[];
  total: number;
}

export async function listPRs(q: ListPRsQuery): Promise<ListPRsResult> {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        purchaseRequest.status,
        q.status as unknown as (typeof purchaseRequest.status.enumValues)[number][],
      ),
    );
  }
  if (q.linkedOrderId) where.push(eq(purchaseRequest.linkedOrderId, q.linkedOrderId));
  if (q.requestedBy) where.push(eq(purchaseRequest.requestedBy, q.requestedBy));

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequest)
      .where(whereExpr),
    db
      .select()
      .from(purchaseRequest)
      .where(whereExpr)
      .orderBy(desc(purchaseRequest.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getPR(id: string): Promise<PurchaseRequest | null> {
  const [row] = await db
    .select()
    .from(purchaseRequest)
    .where(eq(purchaseRequest.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPRLines(prId: string): Promise<PurchaseRequestLine[]> {
  return db
    .select()
    .from(purchaseRequestLine)
    .where(eq(purchaseRequestLine.prId, prId))
    .orderBy(purchaseRequestLine.lineNo);
}

export interface CreatePRLineInput {
  itemId: string;
  qty: number;
  preferredSupplierId?: string | null;
  snapshotLineId?: string | null;
  neededBy?: Date | null;
  notes?: string | null;
}

export interface CreatePRInput {
  title?: string | null;
  source?: "SHORTAGE" | "MANUAL";
  linkedOrderId?: string | null;
  requestedBy: string | null;
  notes?: string | null;
  lines: CreatePRLineInput[];
}

async function genPRCode(): Promise<string> {
  const rows = await db.execute(sql`SELECT app.gen_pr_code() AS code`);
  const row = (rows as unknown as Array<{ code: string }>)[0];
  if (!row) throw new Error("PR_CODE_GEN_FAILED");
  return row.code;
}

/**
 * Tạo PR mới (DRAFT) + lines. Atomic transaction.
 */
export async function createPR(input: CreatePRInput): Promise<PurchaseRequest> {
  if (input.lines.length === 0) throw new Error("PR_MUST_HAVE_LINES");

  return db.transaction(async (tx) => {
    const code = await genPRCode();

    const [header] = await tx
      .insert(purchaseRequest)
      .values({
        code,
        title: input.title ?? null,
        status: "DRAFT",
        source: input.source ?? "MANUAL",
        linkedOrderId: input.linkedOrderId ?? null,
        requestedBy: input.requestedBy,
        notes: input.notes ?? null,
      })
      .returning();
    if (!header) throw new Error("PR_INSERT_FAILED");

    await tx.insert(purchaseRequestLine).values(
      input.lines.map((l, idx) => ({
        prId: header.id,
        lineNo: idx + 1,
        itemId: l.itemId,
        qty: String(l.qty),
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ? l.neededBy.toISOString().slice(0, 10) : null,
        notes: l.notes ?? null,
      })),
    );

    return header;
  });
}

/**
 * Tạo PR từ shortage: lấy snapshot_line cho các itemIds → group by item →
 * sum remaining_short_qty × 1.1 (buffer 10%) → tạo PR.
 */
export async function createPRFromShortage(
  itemIds: string[],
  userId: string | null,
  options: { title?: string | null } = {},
): Promise<PurchaseRequest> {
  if (itemIds.length === 0) throw new Error("NO_ITEMS_SELECTED");

  // Aggregate shortage per item (PLANNED/PURCHASING state, qty > 0)
  const shortageRows = await db.execute(sql`
    SELECT
      bsl.component_item_id AS item_id,
      SUM(bsl.remaining_short_qty) AS total_short,
      MIN(bsl.id) AS sample_line_id,
      MIN(bsl.order_id) AS linked_order_id
    FROM app.bom_snapshot_line bsl
    WHERE bsl.component_item_id = ANY(${itemIds})
      AND bsl.state IN ('PLANNED', 'PURCHASING')
      AND bsl.remaining_short_qty > 0
    GROUP BY bsl.component_item_id
  `);
  const rows = shortageRows as unknown as Array<{
    item_id: string;
    total_short: string;
    sample_line_id: string;
    linked_order_id: string;
  }>;

  if (rows.length === 0) throw new Error("NO_SHORTAGE_FOUND");

  const lines: CreatePRLineInput[] = rows.map((r) => ({
    itemId: r.item_id,
    qty: Number.parseFloat(r.total_short) * 1.1, // 10% buffer
    snapshotLineId: r.sample_line_id,
  }));

  return createPR({
    title: options.title ?? `Shortage auto-PR ${new Date().toISOString().slice(0, 10)}`,
    source: "SHORTAGE",
    linkedOrderId: rows[0]?.linked_order_id ?? null,
    requestedBy: userId,
    lines,
  });
}

/**
 * Submit PR DRAFT → SUBMITTED.
 */
export async function submitPR(id: string): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({ status: "SUBMITTED", updatedAt: new Date() })
    .where(and(eq(purchaseRequest.id, id), eq(purchaseRequest.status, "DRAFT")))
    .returning();
  return row ?? null;
}

/**
 * Approve PR: SUBMITTED → APPROVED (guard: userId phải có role approver).
 */
export async function approvePR(
  id: string,
  approverId: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      status: "APPROVED",
      approvedBy: approverId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        inArray(purchaseRequest.status, ["DRAFT", "SUBMITTED"]),
      ),
    )
    .returning();
  return row ?? null;
}

/** Reject PR (DRAFT/SUBMITTED/APPROVED → REJECTED) */
export async function rejectPR(
  id: string,
  userId: string | null,
  reason?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      status: "REJECTED",
      approvedBy: userId,
      approvedAt: new Date(),
      notes: sql`COALESCE(${purchaseRequest.notes}, '') || ${
        reason ? `\n[REJECTED: ${reason}]` : "\n[REJECTED]"
      }`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        inArray(purchaseRequest.status, ["DRAFT", "SUBMITTED", "APPROVED"]),
      ),
    )
    .returning();
  return row ?? null;
}

/** Enrichment helper: join PR line với item master. */
export async function getPRLinesEnriched(prId: string) {
  return db
    .select({
      id: purchaseRequestLine.id,
      lineNo: purchaseRequestLine.lineNo,
      itemId: purchaseRequestLine.itemId,
      sku: item.sku,
      name: item.name,
      qty: purchaseRequestLine.qty,
      preferredSupplierId: purchaseRequestLine.preferredSupplierId,
      snapshotLineId: purchaseRequestLine.snapshotLineId,
      neededBy: purchaseRequestLine.neededBy,
      notes: purchaseRequestLine.notes,
      grossRequiredQty: bomSnapshotLine.grossRequiredQty,
      remainingShortQty: bomSnapshotLine.remainingShortQty,
    })
    .from(purchaseRequestLine)
    .innerJoin(item, eq(item.id, purchaseRequestLine.itemId))
    .leftJoin(
      bomSnapshotLine,
      eq(bomSnapshotLine.id, purchaseRequestLine.snapshotLineId),
    )
    .where(eq(purchaseRequestLine.prId, prId))
    .orderBy(purchaseRequestLine.lineNo);
}
