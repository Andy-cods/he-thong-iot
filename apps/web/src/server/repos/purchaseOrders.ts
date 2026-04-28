import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  purchaseOrder,
  purchaseOrderLine,
  purchaseRequest,
  purchaseRequestLine,
  salesOrder,
  supplier,
  item,
} from "@iot/db/schema";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * Repository purchase_order — V1.2.
 *
 * V1.2 rule: 1 PO = 1 supplier. PR có N item → convert thành N PO theo
 * preferred_supplier_id. Item không có preferred_supplier → reject convert.
 */

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SENT"
  | "PARTIAL"
  | "RECEIVED"
  | "CANCELLED"
  | "CLOSED";

export interface ListPOsQuery {
  status?: PurchaseOrderStatus[];
  supplierId?: string;
  prId?: string;
  /** V1.8 — filter PO theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId?: string;
  /** V1.9-P9: free-text search poNo / supplierName / supplierCode. */
  q?: string;
  /** V1.9-P9: filter theo orderDate range. */
  from?: Date | null;
  to?: Date | null;
  page: number;
  pageSize: number;
}

export async function listPOs(q: ListPOsQuery) {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        purchaseOrder.status,
        q.status as unknown as (typeof purchaseOrder.status.enumValues)[number][],
      ),
    );
  }
  if (q.supplierId) where.push(eq(purchaseOrder.supplierId, q.supplierId));
  if (q.prId) where.push(eq(purchaseOrder.prId, q.prId));
  if (q.bomTemplateId) {
    where.push(eq(salesOrder.bomTemplateId, q.bomTemplateId));
  }
  if (q.q) {
    const like = `%${q.q}%`;
    const combined = or(
      ilike(purchaseOrder.poNo, like),
      ilike(supplier.code, like),
      ilike(supplier.name, like),
    );
    if (combined) where.push(combined);
  }
  if (q.from) {
    where.push(
      sql`${purchaseOrder.orderDate} >= ${q.from.toISOString().slice(0, 10)}`,
    );
  }
  if (q.to) {
    where.push(
      sql`${purchaseOrder.orderDate} <= ${q.to.toISOString().slice(0, 10)}`,
    );
  }

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrder)
      .leftJoin(supplier, eq(purchaseOrder.supplierId, supplier.id))
      .leftJoin(salesOrder, eq(salesOrder.id, purchaseOrder.linkedOrderId))
      .where(whereExpr),
    db
      .select({
        id: purchaseOrder.id,
        poNo: purchaseOrder.poNo,
        supplierId: purchaseOrder.supplierId,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        status: purchaseOrder.status,
        orderDate: purchaseOrder.orderDate,
        expectedEta: purchaseOrder.expectedEta,
        currency: purchaseOrder.currency,
        totalAmount: purchaseOrder.totalAmount,
        prId: purchaseOrder.prId,
        linkedOrderId: purchaseOrder.linkedOrderId,
        notes: purchaseOrder.notes,
        sentAt: purchaseOrder.sentAt,
        cancelledAt: purchaseOrder.cancelledAt,
        createdAt: purchaseOrder.createdAt,
        createdBy: purchaseOrder.createdBy,
        metadata: purchaseOrder.metadata,
      })
      .from(purchaseOrder)
      .leftJoin(supplier, eq(purchaseOrder.supplierId, supplier.id))
      .leftJoin(salesOrder, eq(salesOrder.id, purchaseOrder.linkedOrderId))
      .where(whereExpr)
      .orderBy(desc(purchaseOrder.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return { rows, total: totalResult[0]?.count ?? 0 };
}

/**
 * Aggregate stats cho tất cả PO (không phân trang) — dùng cho KPI cards.
 * Trả về: total count, open count (DRAFT/SENT/PARTIAL), totalSpend (tổng amount tất cả PO),
 * supplierCount distinct, overdueCount (SENT|PARTIAL với expectedEta < now).
 */
export async function getPOStats(q: Pick<ListPOsQuery, "status" | "supplierId" | "prId" | "bomTemplateId" | "q" | "from" | "to">) {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        purchaseOrder.status,
        q.status as unknown as (typeof purchaseOrder.status.enumValues)[number][],
      ),
    );
  }
  if (q.supplierId) where.push(eq(purchaseOrder.supplierId, q.supplierId));
  if (q.prId) where.push(eq(purchaseOrder.prId, q.prId));
  if (q.bomTemplateId) where.push(eq(salesOrder.bomTemplateId, q.bomTemplateId));
  if (q.q) {
    const like = `%${q.q}%`;
    const combined = or(
      ilike(purchaseOrder.poNo, like),
      ilike(supplier.code, like),
      ilike(supplier.name, like),
    );
    if (combined) where.push(combined);
  }
  if (q.from) {
    where.push(sql`${purchaseOrder.orderDate} >= ${q.from.toISOString().slice(0, 10)}`);
  }
  if (q.to) {
    where.push(sql`${purchaseOrder.orderDate} <= ${q.to.toISOString().slice(0, 10)}`);
  }

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      openCount: sql<number>`count(*) filter (where ${purchaseOrder.status} in ('DRAFT','SENT','PARTIAL'))::int`,
      sentCount: sql<number>`count(*) filter (where ${purchaseOrder.status} = 'SENT')::int`,
      partialCount: sql<number>`count(*) filter (where ${purchaseOrder.status} = 'PARTIAL')::int`,
      receivedCount: sql<number>`count(*) filter (where ${purchaseOrder.status} in ('RECEIVED','CLOSED'))::int`,
      cancelledCount: sql<number>`count(*) filter (where ${purchaseOrder.status} = 'CANCELLED')::int`,
      totalSpend: sql<string>`coalesce(sum(${purchaseOrder.totalAmount})::numeric::text, '0')`,
      receivedSpend: sql<string>`coalesce(sum(${purchaseOrder.totalAmount}) filter (where ${purchaseOrder.status} in ('RECEIVED','CLOSED'))::numeric::text, '0')`,
      pendingSpend: sql<string>`coalesce(sum(${purchaseOrder.totalAmount}) filter (where ${purchaseOrder.status} in ('SENT','PARTIAL'))::numeric::text, '0')`,
      supplierCount: sql<number>`count(distinct ${purchaseOrder.supplierId})::int`,
      overdueCount: sql<number>`count(*) filter (where ${purchaseOrder.status} in ('SENT','PARTIAL') and ${purchaseOrder.expectedEta} is not null and ${purchaseOrder.expectedEta} < current_date)::int`,
    })
    .from(purchaseOrder)
    .leftJoin(supplier, eq(purchaseOrder.supplierId, supplier.id))
    .leftJoin(salesOrder, eq(salesOrder.id, purchaseOrder.linkedOrderId))
    .where(whereExpr);

  return {
    total: stats?.total ?? 0,
    openCount: stats?.openCount ?? 0,
    sentCount: stats?.sentCount ?? 0,
    partialCount: stats?.partialCount ?? 0,
    receivedCount: stats?.receivedCount ?? 0,
    cancelledCount: stats?.cancelledCount ?? 0,
    totalSpend: stats?.totalSpend ?? "0",
    receivedSpend: stats?.receivedSpend ?? "0",
    pendingSpend: stats?.pendingSpend ?? "0",
    supplierCount: stats?.supplierCount ?? 0,
    overdueCount: stats?.overdueCount ?? 0,
  };
}

export async function getPO(id: string): Promise<PurchaseOrder | null> {
  const [row] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPOLines(poId: string) {
  return db
    .select({
      id: purchaseOrderLine.id,
      poId: purchaseOrderLine.poId,
      lineNo: purchaseOrderLine.lineNo,
      itemId: purchaseOrderLine.itemId,
      itemSku: item.sku,
      itemName: item.name,
      itemUom: item.uom,
      orderedQty: purchaseOrderLine.orderedQty,
      receivedQty: purchaseOrderLine.receivedQty,
      unitPrice: purchaseOrderLine.unitPrice,
      taxRate: purchaseOrderLine.taxRate,
      lineTotal: purchaseOrderLine.lineTotal,
      expectedEta: purchaseOrderLine.expectedEta,
      snapshotLineId: purchaseOrderLine.snapshotLineId,
      notes: purchaseOrderLine.notes,
    })
    .from(purchaseOrderLine)
    .leftJoin(item, eq(purchaseOrderLine.itemId, item.id))
    .where(eq(purchaseOrderLine.poId, poId))
    .orderBy(purchaseOrderLine.lineNo);
}

/**
 * V3.4 — Replace toàn bộ lines của PO + recompute totalAmount header.
 * Chỉ allowed khi status DRAFT (caller cần check).
 *
 * Sau khi insert lines, totalAmount = SUM(orderedQty * unitPrice * (1 + taxRate/100)).
 * lineTotal mỗi line = orderedQty * unitPrice * (1 + taxRate/100).
 */
export interface ReplacePOLineInput {
  itemId: string;
  orderedQty: number;
  unitPrice?: number;
  taxRate?: number;
  snapshotLineId?: string | null;
  expectedEta?: Date | null;
  notes?: string | null;
}

export async function replacePOLines(
  poId: string,
  lines: ReplacePOLineInput[],
): Promise<{ totalAmount: string }> {
  if (lines.length === 0) throw new Error("PO_MUST_HAVE_LINES");
  return db.transaction(async (tx) => {
    await tx
      .delete(purchaseOrderLine)
      .where(eq(purchaseOrderLine.poId, poId));

    let runningTotal = 0;
    const valuesToInsert = lines.map((l, idx) => {
      const qty = Number(l.orderedQty);
      const price = Number(l.unitPrice ?? 0);
      const taxPct = Number(l.taxRate ?? 8);
      const lineTotal = qty * price * (1 + taxPct / 100);
      runningTotal += lineTotal;
      return {
        poId,
        lineNo: idx + 1,
        itemId: l.itemId,
        orderedQty: String(qty),
        receivedQty: "0",
        unitPrice: String(price),
        taxRate: String(taxPct),
        lineTotal: String(lineTotal),
        expectedEta: l.expectedEta ? l.expectedEta.toISOString().slice(0, 10) : null,
        snapshotLineId: l.snapshotLineId ?? null,
        notes: l.notes ?? null,
      };
    });

    await tx.insert(purchaseOrderLine).values(valuesToInsert);

    const totalAmount = runningTotal.toFixed(2);
    await tx
      .update(purchaseOrder)
      .set({ totalAmount })
      .where(eq(purchaseOrder.id, poId));

    return { totalAmount };
  });
}

/**
 * Convert 1 PR APPROVED thành N PO theo preferred_supplier_id grouping.
 * Atomic transaction — nếu 1 item line không có preferred supplier → reject
 * toàn bộ (user cần fix PR trước).
 *
 * Side effect: PR status → CONVERTED.
 */
export interface ConvertPRResult {
  createdPOs: PurchaseOrder[];
  linesBySupplier: Record<string, number>;
}

/**
 * V3.4 — Tạo PO từ PR. Nếu line thiếu preferred_supplier, caller có thể truyền
 * `supplierOverrides: Record<lineId, supplierId>` để gán nhanh khi convert.
 *  - Nếu vẫn còn line không có supplier sau override → throw MISSING_PREFERRED_SUPPLIER
 *  - Override sẽ ghi vào DB (update purchase_request_line) trước khi group.
 */
export async function createPOFromPR(
  prId: string,
  userId: string | null,
  supplierOverrides?: Record<string, string>,
): Promise<ConvertPRResult> {
  return db.transaction(async (tx) => {
    const [pr] = await tx
      .select()
      .from(purchaseRequest)
      .where(eq(purchaseRequest.id, prId))
      .limit(1);
    if (!pr) throw new Error("PR_NOT_FOUND");
    if (pr.status !== "APPROVED") {
      throw new Error(`PR_NOT_APPROVED (status=${pr.status})`);
    }

    let lines = await tx
      .select()
      .from(purchaseRequestLine)
      .where(eq(purchaseRequestLine.prId, prId));
    if (lines.length === 0) throw new Error("PR_EMPTY");

    // V3.4 — Apply overrides nếu có
    if (supplierOverrides && Object.keys(supplierOverrides).length > 0) {
      for (const [lineId, supplierId] of Object.entries(supplierOverrides)) {
        if (!supplierId) continue;
        await tx
          .update(purchaseRequestLine)
          .set({ preferredSupplierId: supplierId })
          .where(eq(purchaseRequestLine.id, lineId));
      }
      // Refresh lines
      lines = await tx
        .select()
        .from(purchaseRequestLine)
        .where(eq(purchaseRequestLine.prId, prId));
    }

    // Guard: toàn bộ line phải có preferred_supplier_id
    const missing = lines.filter((l) => !l.preferredSupplierId);
    if (missing.length > 0) {
      throw new Error(
        `MISSING_PREFERRED_SUPPLIER: ${missing.length} line chưa gán supplier`,
      );
    }

    // Group by supplier
    const bySupplier = new Map<string, typeof lines>();
    for (const l of lines) {
      const key = l.preferredSupplierId!;
      const arr = bySupplier.get(key) ?? [];
      arr.push(l);
      bySupplier.set(key, arr);
    }

    const createdPOs: PurchaseOrder[] = [];
    const linesBySupplier: Record<string, number> = {};
    const yymm = new Date().toISOString().slice(2, 7).replace("-", "");

    let seqCounter = 1;
    for (const [supplierId, supplierLines] of bySupplier.entries()) {
      const poNo = `PO-${yymm}-${pr.code.slice(-4)}-${seqCounter
        .toString()
        .padStart(2, "0")}`;
      seqCounter += 1;

      const [poHeader] = await tx
        .insert(purchaseOrder)
        .values({
          poNo,
          supplierId,
          prId: pr.id,
          linkedOrderId: pr.linkedOrderId,
          status: "DRAFT",
          createdBy: userId,
        })
        .returning();
      if (!poHeader) throw new Error("PO_INSERT_FAILED");

      await tx.insert(purchaseOrderLine).values(
        supplierLines.map((l, idx) => ({
          poId: poHeader.id,
          lineNo: idx + 1,
          itemId: l.itemId,
          orderedQty: l.qty,
          snapshotLineId: l.snapshotLineId ?? null,
          expectedEta: l.neededBy,
          notes: l.notes,
        })),
      );

      createdPOs.push(poHeader);
      linesBySupplier[supplierId] = supplierLines.length;
    }

    // Update PR → CONVERTED
    await tx
      .update(purchaseRequest)
      .set({ status: "CONVERTED", updatedAt: new Date() })
      .where(eq(purchaseRequest.id, prId));

    return { createdPOs, linesBySupplier };
  });
}

export interface CreatePOManualInput {
  supplierId: string;
  prId?: string | null;
  linkedOrderId?: string | null;
  expectedEta?: Date | null;
  currency?: string;
  paymentTerms?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
  autoApprove?: boolean;
  createdBy: string | null;
  lines: Array<{
    itemId: string;
    orderedQty: number;
    unitPrice?: number;
    taxRate?: number;
    snapshotLineId?: string | null;
    expectedEta?: Date | null;
    notes?: string | null;
  }>;
}

/** V1.9-P9: tính line_total = qty * price * (1 + tax/100). */
function computeLineTotal(qty: number, price: number, taxRate: number): number {
  return Math.round(qty * price * (1 + taxRate / 100) * 100) / 100;
}

/** Tạo PO thủ công (không từ PR). */
export async function createPO(
  input: CreatePOManualInput,
): Promise<PurchaseOrder> {
  if (input.lines.length === 0) throw new Error("PO_MUST_HAVE_LINES");

  return db.transaction(async (tx) => {
    const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
    // Simple seq: count existing PO this month + 1
    const cntRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS c FROM app.purchase_order
      WHERE po_no LIKE ${`PO-${yymm}-%`}
    `);
    const cnt = (cntRows as unknown as Array<{ c: number }>)[0]?.c ?? 0;
    const poNo = `PO-${yymm}-MAN-${(cnt + 1).toString().padStart(3, "0")}`;

    // Tính totalAmount từ lines.
    let total = 0;
    const linesPrepared = input.lines.map((l, idx) => {
      const qty = Number(l.orderedQty);
      const price = Number(l.unitPrice ?? 0);
      const tax = Number(l.taxRate ?? 8);
      const lineTotal = computeLineTotal(qty, price, tax);
      total += lineTotal;
      return {
        poId: "",
        lineNo: idx + 1,
        itemId: l.itemId,
        orderedQty: String(qty),
        unitPrice: String(price),
        taxRate: String(tax),
        lineTotal: String(lineTotal),
        snapshotLineId: l.snapshotLineId ?? null,
        expectedEta: l.expectedEta
          ? l.expectedEta.toISOString().slice(0, 10)
          : null,
        notes: l.notes ?? null,
      };
    });

    const approve = input.autoApprove === true;
    const now = new Date();
    const metadata: Record<string, unknown> = approve
      ? {
          approvalStatus: "approved",
          approvedBy: input.createdBy ?? undefined,
          approvedAt: now.toISOString(),
        }
      : {};

    const [header] = await tx
      .insert(purchaseOrder)
      .values({
        poNo,
        supplierId: input.supplierId,
        prId: input.prId ?? null,
        linkedOrderId: input.linkedOrderId ?? null,
        expectedEta: input.expectedEta
          ? input.expectedEta.toISOString().slice(0, 10)
          : null,
        currency: input.currency ?? "VND",
        paymentTerms: input.paymentTerms ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        notes: input.notes ?? null,
        status: approve ? "SENT" : "DRAFT",
        sentAt: approve ? now : null,
        totalAmount: String(total),
        metadata,
        createdBy: input.createdBy,
      })
      .returning();
    if (!header) throw new Error("PO_INSERT_FAILED");

    await tx.insert(purchaseOrderLine).values(
      linesPrepared.map((l) => ({ ...l, poId: header.id })),
    );

    return header;
  });
}

export async function sendPO(id: string): Promise<PurchaseOrder | null> {
  const [row] = await db
    .update(purchaseOrder)
    .set({ status: "SENT", sentAt: new Date() })
    .where(and(eq(purchaseOrder.id, id), eq(purchaseOrder.status, "DRAFT")))
    .returning();
  return row ?? null;
}

/**
 * V1.9-P9: submit PO DRAFT → pending approval (metadata.approvalStatus).
 */
export async function submitPOForApproval(
  id: string,
  userId: string | null,
): Promise<PurchaseOrder | null> {
  const [before] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, id))
    .limit(1);
  if (!before) return null;
  if (before.status !== "DRAFT") throw new Error("NOT_DRAFT");

  const metadata = {
    ...((before.metadata as Record<string, unknown>) ?? {}),
    approvalStatus: "pending",
    submittedBy: userId ?? undefined,
    submittedAt: new Date().toISOString(),
  };

  const [row] = await db
    .update(purchaseOrder)
    .set({ metadata })
    .where(eq(purchaseOrder.id, id))
    .returning();
  return row ?? null;
}

export async function approvePO(
  id: string,
  userId: string | null,
  notes?: string | null,
): Promise<PurchaseOrder | null> {
  const [before] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, id))
    .limit(1);
  if (!before) return null;
  if (before.status !== "DRAFT") throw new Error("NOT_DRAFT");

  const metadata = {
    ...((before.metadata as Record<string, unknown>) ?? {}),
    approvalStatus: "approved",
    approvedBy: userId ?? undefined,
    approvedAt: new Date().toISOString(),
    approvalNotes: notes ?? null,
  };

  const [row] = await db
    .update(purchaseOrder)
    .set({ metadata })
    .where(eq(purchaseOrder.id, id))
    .returning();
  return row ?? null;
}

export async function rejectPO(
  id: string,
  userId: string | null,
  reason: string,
): Promise<PurchaseOrder | null> {
  const [before] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, id))
    .limit(1);
  if (!before) return null;
  if (before.status !== "DRAFT") throw new Error("NOT_DRAFT");

  const metadata = {
    ...((before.metadata as Record<string, unknown>) ?? {}),
    approvalStatus: "rejected",
    rejectedBy: userId ?? undefined,
    rejectedAt: new Date().toISOString(),
    rejectedReason: reason,
  };

  const [row] = await db
    .update(purchaseOrder)
    .set({ metadata })
    .where(eq(purchaseOrder.id, id))
    .returning();
  return row ?? null;
}

/**
 * V3 (TASK-20260427-014) — Aggregate qty đã nhận trên 1 PO (sum lines).
 *
 * Trả `{ ordered, received, ratio }`. Dùng làm guard cho approve receiving
 * (yêu cầu received >= 95% ordered).
 */
export async function getPOReceivingTotals(id: string): Promise<{
  ordered: number;
  received: number;
  ratio: number;
}> {
  const [row] = await db
    .select({
      ordered: sql<string>`COALESCE(SUM(${purchaseOrderLine.orderedQty}), 0)::text`,
      received: sql<string>`COALESCE(SUM(${purchaseOrderLine.receivedQty}), 0)::text`,
    })
    .from(purchaseOrderLine)
    .where(eq(purchaseOrderLine.poId, id));

  const ordered = Number(row?.ordered ?? "0");
  const received = Number(row?.received ?? "0");
  const ratio = ordered > 0 ? received / ordered : 0;
  return { ordered, received, ratio };
}

/**
 * V3 (TASK-20260427-014) — Approve PO sau khi nhận hàng.
 *
 * SENT/PARTIAL → RECEIVED. Lưu actualDeliveryDate=now, metadata receivedBy/At/note.
 * Caller phải check threshold 95% trước khi gọi (để tách validation/db).
 */
export async function markPOReceived(
  id: string,
  userId: string | null,
  note?: string | null,
): Promise<PurchaseOrder | null> {
  const [before] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, id))
    .limit(1);
  if (!before) return null;

  const metadata = {
    ...((before.metadata as Record<string, unknown>) ?? {}),
    receivedBy: userId ?? undefined,
    receivedAt: new Date().toISOString(),
    receivedNote: note ?? null,
  };

  const [row] = await db
    .update(purchaseOrder)
    .set({
      status: "RECEIVED",
      actualDeliveryDate: sql`CURRENT_DATE`,
      metadata,
    })
    .where(
      and(
        eq(purchaseOrder.id, id),
        inArray(purchaseOrder.status, ["SENT", "PARTIAL"]),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V3 (TASK-20260427-014) — Reject PO sau khi nhận hàng (hư hỏng, sai item, …).
 *
 * SENT/PARTIAL → CANCELLED + metadata.rejectedReason. KHÔNG có enum REJECTED
 * cho PO trong V1, dùng CANCELLED + metadata để đánh dấu bị từ chối.
 */
export async function rejectReceivingPO(
  id: string,
  userId: string | null,
  reason: string,
): Promise<PurchaseOrder | null> {
  const [before] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, id))
    .limit(1);
  if (!before) return null;

  const metadata = {
    ...((before.metadata as Record<string, unknown>) ?? {}),
    rejectedBy: userId ?? undefined,
    rejectedAt: new Date().toISOString(),
    rejectedReason: reason,
    rejectedStage: "RECEIVING",
  };

  const [row] = await db
    .update(purchaseOrder)
    .set({
      status: "CANCELLED",
      cancelledAt: new Date(),
      metadata,
    })
    .where(
      and(
        eq(purchaseOrder.id, id),
        inArray(purchaseOrder.status, ["SENT", "PARTIAL"]),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * V1.9-P9 — list PO cho export kế toán (join đầy đủ để xuất Excel).
 */
export async function listPOsForExport(q: {
  status?: PurchaseOrderStatus[];
  supplierId?: string;
  from?: Date | null;
  to?: Date | null;
}) {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        purchaseOrder.status,
        q.status as unknown as (typeof purchaseOrder.status.enumValues)[number][],
      ),
    );
  }
  if (q.supplierId) where.push(eq(purchaseOrder.supplierId, q.supplierId));
  if (q.from) {
    where.push(
      sql`${purchaseOrder.orderDate} >= ${q.from.toISOString().slice(0, 10)}`,
    );
  }
  if (q.to) {
    where.push(
      sql`${purchaseOrder.orderDate} <= ${q.to.toISOString().slice(0, 10)}`,
    );
  }
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;

  const rows = await db
    .select({
      poId: purchaseOrder.id,
      poNo: purchaseOrder.poNo,
      orderDate: purchaseOrder.orderDate,
      expectedEta: purchaseOrder.expectedEta,
      actualDeliveryDate: purchaseOrder.actualDeliveryDate,
      status: purchaseOrder.status,
      totalAmount: purchaseOrder.totalAmount,
      currency: purchaseOrder.currency,
      prId: purchaseOrder.prId,
      supplierId: purchaseOrder.supplierId,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      supplierTaxCode: supplier.taxCode,
      createdByName: sql<string | null>`null`,
      lineNo: purchaseOrderLine.lineNo,
      itemSku: item.sku,
      itemName: item.name,
      itemUom: item.uom,
      orderedQty: purchaseOrderLine.orderedQty,
      unitPrice: purchaseOrderLine.unitPrice,
      taxRate: purchaseOrderLine.taxRate,
      lineTotal: purchaseOrderLine.lineTotal,
    })
    .from(purchaseOrder)
    .innerJoin(
      purchaseOrderLine,
      eq(purchaseOrderLine.poId, purchaseOrder.id),
    )
    .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .leftJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(whereExpr)
    .orderBy(desc(purchaseOrder.createdAt), purchaseOrderLine.lineNo);

  return rows;
}
