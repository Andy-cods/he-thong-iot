import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  bomSnapshotLine,
  item,
  purchaseRequest,
  purchaseRequestLine,
  salesOrder,
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
  /** V1.8 — filter PR theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId?: string;
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
  if (q.bomTemplateId) {
    // V1.8 — PR.linked_order_id → sales_order.bom_template_id. PR manual không
    // gắn linked_order_id sẽ không lọt vào workspace scope — đúng ý đồ.
    where.push(eq(salesOrder.bomTemplateId, q.bomTemplateId));
  }

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const baseQuery = db
    .select({ pr: purchaseRequest })
    .from(purchaseRequest)
    .leftJoin(salesOrder, eq(salesOrder.id, purchaseRequest.linkedOrderId));

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequest)
      .leftJoin(salesOrder, eq(salesOrder.id, purchaseRequest.linkedOrderId))
      .where(whereExpr),
    baseQuery
      .where(whereExpr)
      .orderBy(desc(purchaseRequest.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) => r.pr),
    total: totalResult[0]?.count ?? 0,
  };
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
  /** V3.7.72 — Nullable: cho phép free-text item chưa có trong master. */
  itemId?: string | null;
  itemName?: string | null;
  itemSku?: string | null;
  qty: number;
  preferredSupplierId?: string | null;
  snapshotLineId?: string | null;
  neededBy?: Date | null;
  notes?: string | null;
  // V3.7.55 — MRF GTAM fields
  specification?: string | null;
  uom?: string | null;
  priority?: "URGENT" | "NORMAL" | "RESERVE" | null;
  category?: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null;
  estimatedUnitPrice?: number | null;
  referenceCode?: string | null;
  // V3.7.69 YCVT — Tồn kho lúc tạo (auto-fill từ inventory_balance).
  onHandSnapshot?: number | null;
}

export interface CreatePRInput {
  title?: string | null;
  source?: "SHORTAGE" | "MANUAL";
  linkedOrderId?: string | null;
  requestedBy: string | null;
  notes?: string | null;
  lines: CreatePRLineInput[];
  // V3.7.55 — MRF GTAM header fields
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestReason?: string | null;
}

async function genPRCode(): Promise<string> {
  const rows = await db.execute(sql`SELECT app.gen_pr_code() AS code`);
  const row = (rows as unknown as Array<{ code: string }>)[0];
  if (!row) throw new Error("PR_CODE_GEN_FAILED");
  return row.code;
}

/**
 * V3.7.69 YCVT — sinh số phiếu giấy `{seq}/PRD-MRF/{MMYY}`.
 * Gọi khi user bấm "Gửi phiếu" (transition DRAFT → SUBMITTED).
 */
async function genPaperFormNo(): Promise<string> {
  const rows = await db.execute(sql`SELECT app.gen_pr_paper_form_no() AS no`);
  const row = (rows as unknown as Array<{ no: string }>)[0];
  if (!row) throw new Error("PR_PAPER_NO_GEN_FAILED");
  return row.no;
}

/**
 * V3.7.69 YCVT — preview số phiếu kế tiếp KHÔNG consume sequence.
 * Dùng để hiện trên UI lúc user đang nhập form (read-only preview).
 */
export async function previewNextPaperFormNo(): Promise<string> {
  // Lưu ý: gọi gen function thật sẽ không tăng counter vì counter là MAX(...)+1.
  return genPaperFormNo();
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
        targetDepartment: input.targetDepartment ?? null,
        proposingDepartment: input.proposingDepartment ?? null,
        requestReason: input.requestReason ?? null,
      })
      .returning();
    if (!header) throw new Error("PR_INSERT_FAILED");

    await tx.insert(purchaseRequestLine).values(
      input.lines.map((l, idx) => ({
        prId: header.id,
        lineNo: idx + 1,
        itemId: l.itemId ?? null,
        // V3.7.72 — Free-text name/sku khi itemId null
        itemName: l.itemName ?? null,
        itemSku: l.itemSku ?? null,
        qty: String(l.qty),
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ? l.neededBy.toISOString().slice(0, 10) : null,
        notes: l.notes ?? null,
        // V3.7.55 — MRF GTAM line fields
        specification: l.specification ?? null,
        uom: l.uom ?? null,
        priority: l.priority ?? "NORMAL",
        category: l.category ?? null,
        estimatedUnitPrice:
          l.estimatedUnitPrice != null ? String(l.estimatedUnitPrice) : null,
        referenceCode: l.referenceCode ?? null,
        // V3.7.69 YCVT
        onHandSnapshot:
          l.onHandSnapshot != null ? String(l.onHandSnapshot) : null,
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
 * V3.4 — Replace toàn bộ lines của PR (DRAFT/SUBMITTED only).
 * Strategy: delete tất cả + insert lại theo input. Đơn giản hơn diff cá nhân
 * từng line, dù cost cao hơn 1 chút (PR thường < 50 lines).
 */
export interface ReplacePRLineInput {
  /** V3.7.72 — Nullable. */
  itemId?: string | null;
  itemName?: string | null;
  itemSku?: string | null;
  qty: number;
  preferredSupplierId?: string | null;
  snapshotLineId?: string | null;
  neededBy?: Date | null;
  notes?: string | null;
  // V3.7.55 — MRF GTAM fields
  specification?: string | null;
  uom?: string | null;
  priority?: "URGENT" | "NORMAL" | "RESERVE" | null;
  category?: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null;
  estimatedUnitPrice?: number | null;
  referenceCode?: string | null;
  // V3.7.69 YCVT
  onHandSnapshot?: number | null;
}

export async function replacePRLines(
  prId: string,
  lines: ReplacePRLineInput[],
): Promise<void> {
  if (lines.length === 0) throw new Error("PR_MUST_HAVE_LINES");
  await db.transaction(async (tx) => {
    await tx
      .delete(purchaseRequestLine)
      .where(eq(purchaseRequestLine.prId, prId));
    await tx.insert(purchaseRequestLine).values(
      lines.map((l, idx) => ({
        prId,
        lineNo: idx + 1,
        itemId: l.itemId ?? null,
        itemName: l.itemName ?? null,
        itemSku: l.itemSku ?? null,
        qty: String(l.qty),
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ? l.neededBy.toISOString().slice(0, 10) : null,
        notes: l.notes ?? null,
        // V3.7.55 — MRF GTAM line fields
        specification: l.specification ?? null,
        uom: l.uom ?? null,
        priority: l.priority ?? "NORMAL",
        category: l.category ?? null,
        estimatedUnitPrice:
          l.estimatedUnitPrice != null ? String(l.estimatedUnitPrice) : null,
        referenceCode: l.referenceCode ?? null,
        // V3.7.69 YCVT
        onHandSnapshot:
          l.onHandSnapshot != null ? String(l.onHandSnapshot) : null,
      })),
    );
  });
}

/**
 * Submit PR DRAFT → SUBMITTED.
 * V3.7.69 YCVT — đồng thời sinh paper_form_no nếu chưa có + set approval_step.
 */
export async function submitPR(id: string): Promise<PurchaseRequest | null> {
  return db.transaction(async (tx) => {
    // Check current state
    const [current] = await tx
      .select({
        id: purchaseRequest.id,
        status: purchaseRequest.status,
        paperFormNo: purchaseRequest.paperFormNo,
      })
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, id))
      .limit(1);
    if (!current || current.status !== "DRAFT") return null;

    const paperFormNo = current.paperFormNo ?? (await genPaperFormNo());

    const [row] = await tx
      .update(purchaseRequest)
      .set({
        status: "SUBMITTED",
        approvalStep: "SUBMITTED",
        paperFormNo,
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseRequest.id, id), eq(purchaseRequest.status, "DRAFT")))
      .returning();
    return row ?? null;
  });
}

/**
 * V3.7.69 YCVT — Step 2: Trưởng bộ phận duyệt.
 * SUBMITTED → DEPT_APPROVED.
 */
export async function deptApprovePR(
  id: string,
  approverId: string,
  note?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      approvalStep: "DEPT_APPROVED",
      deptApprovedBy: approverId,
      deptApprovedAt: new Date(),
      deptApprovalNote: note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        eq(purchaseRequest.approvalStep, "SUBMITTED"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3.7.69 YCVT — Step 3: Giám đốc/Mua hàng duyệt.
 * DEPT_APPROVED → DIRECTOR_APPROVED. Đồng thời set status = APPROVED để chuyển
 * sang flow tạo PO existing (giữ backwards-compat với module purchase-orders).
 */
export async function directorApprovePR(
  id: string,
  approverId: string,
  note?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      status: "APPROVED",
      approvalStep: "DIRECTOR_APPROVED",
      directorApprovedBy: approverId,
      directorApprovedAt: new Date(),
      directorApprovalNote: note ?? null,
      approvedBy: approverId, // back-compat (= director step)
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        eq(purchaseRequest.approvalStep, "DEPT_APPROVED"),
      ),
    )
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

/**
 * V3.7.70 YCVT — Timeline IV.1: Auto-hook khi PO link với PR được duyệt
 * RECEIVED. Idempotent: chỉ set goods_received_at lần đầu.
 */
export async function markPRGoodsReceived(
  id: string,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({ goodsReceivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(purchaseRequest.id, id),
        sql`${purchaseRequest.goodsReceivedAt} IS NULL`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3.7.70 YCVT — Timeline IV.2: Manual mark "Đã xuất kho" bởi admin/warehouse.
 * Idempotent qua WHERE goodsIssuedAt IS NULL.
 */
export async function markPRGoodsIssued(
  id: string,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({ goodsIssuedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(purchaseRequest.id, id),
        sql`${purchaseRequest.goodsIssuedAt} IS NULL`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3.7.70 YCVT — Timeline IV.3: Manual mark "Hoàn tất" bởi admin.
 * Idempotent qua WHERE completedAt IS NULL. Đồng thời set approval_step = DONE.
 */
export async function markPRCompleted(
  id: string,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      completedAt: new Date(),
      approvalStep: "DONE",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseRequest.id, id),
        sql`${purchaseRequest.completedAt} IS NULL`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3.7.71 YCVT — Hard-delete PR (admin only).
 *
 * Guard:
 *   - Nếu có PO link → throw "PR_HAS_POS" (admin phải gọi với force=true để
 *     null-out po.pr_id trước).
 *   - Lines tự cascade qua FK onDelete: cascade.
 *
 * Trả về true nếu xoá thành công, throw nếu fail.
 */
export async function deletePR(
  id: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Check PO link
    const linkedPOs = await tx.execute(sql`
      SELECT id, po_no FROM app.purchase_order WHERE pr_id = ${id}
    `);
    const linkedRows = linkedPOs as unknown as Array<{
      id: string;
      po_no: string;
    }>;

    if (linkedRows.length > 0) {
      if (!options.force) {
        const list = linkedRows.map((r) => r.po_no).join(", ");
        throw new Error(`PR_HAS_POS: ${linkedRows.length} PO (${list})`);
      }
      // Force: null-out po.pr_id để không vi phạm FK
      await tx.execute(sql`
        UPDATE app.purchase_order SET pr_id = NULL WHERE pr_id = ${id}
      `);
    }

    // Lines cascade automatically via onDelete CASCADE
    const result = await tx
      .delete(purchaseRequest)
      .where(eq(purchaseRequest.id, id));
    // postgres-js trả rowCount qua result.count
    const count = (result as unknown as { count?: number }).count ?? 0;
    if (count === 0) throw new Error("PR_NOT_FOUND");
    return true;
  });
}

/** Reject PR (DRAFT/SUBMITTED/APPROVED → REJECTED). V3.7.69 set approval_step REJECTED + lưu rejection_reason. */
export async function rejectPR(
  id: string,
  userId: string | null,
  reason?: string | null,
): Promise<PurchaseRequest | null> {
  const [row] = await db
    .update(purchaseRequest)
    .set({
      status: "REJECTED",
      approvalStep: "REJECTED",
      approvedBy: userId,
      approvedAt: new Date(),
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: reason ?? null,
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

/**
 * Enrichment helper: join PR line với item master.
 * V3.7.72 — LEFT JOIN item (vì itemId nullable). Fallback hiển thị name/sku
 * lấy từ item master nếu có itemId, else dùng itemName/itemSku free-text.
 */
export async function getPRLinesEnriched(prId: string) {
  const rows = await db
    .select({
      id: purchaseRequestLine.id,
      lineNo: purchaseRequestLine.lineNo,
      itemId: purchaseRequestLine.itemId,
      // V3.7.72 — sku/name từ master (nullable khi itemId NULL)
      masterSku: item.sku,
      masterName: item.name,
      masterUom: item.uom,
      // V3.7.72 — free-text fallback
      itemSku: purchaseRequestLine.itemSku,
      itemName: purchaseRequestLine.itemName,
      qty: purchaseRequestLine.qty,
      preferredSupplierId: purchaseRequestLine.preferredSupplierId,
      snapshotLineId: purchaseRequestLine.snapshotLineId,
      neededBy: purchaseRequestLine.neededBy,
      notes: purchaseRequestLine.notes,
      grossRequiredQty: bomSnapshotLine.grossRequiredQty,
      remainingShortQty: bomSnapshotLine.remainingShortQty,
      // V3.7.55 — MRF GTAM line fields
      specification: purchaseRequestLine.specification,
      uom: purchaseRequestLine.uom,
      priority: purchaseRequestLine.priority,
      category: purchaseRequestLine.category,
      estimatedUnitPrice: purchaseRequestLine.estimatedUnitPrice,
      referenceCode: purchaseRequestLine.referenceCode,
      approvedQty: purchaseRequestLine.approvedQty,
      // V3.7.69 YCVT
      onHandSnapshot: purchaseRequestLine.onHandSnapshot,
      lineTotal: purchaseRequestLine.lineTotal,
    })
    .from(purchaseRequestLine)
    .leftJoin(item, eq(item.id, purchaseRequestLine.itemId))
    .leftJoin(
      bomSnapshotLine,
      eq(bomSnapshotLine.id, purchaseRequestLine.snapshotLineId),
    )
    .where(eq(purchaseRequestLine.prId, prId))
    .orderBy(purchaseRequestLine.lineNo);

  // Resolve display fields với fallback: master → free-text
  return rows.map((r) => ({
    ...r,
    sku: r.masterSku ?? r.itemSku ?? null,
    name: r.masterName ?? r.itemName ?? null,
    itemUom: r.masterUom ?? null,
  }));
}
