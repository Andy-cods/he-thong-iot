import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
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

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrder)
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
        receivedAt: purchaseOrder.receivedAt,
        createdAt: purchaseOrder.createdAt,
        updatedAt: purchaseOrder.updatedAt,
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
      unit: purchaseOrderLine.unit,
      orderedQty: purchaseOrderLine.orderedQty,
      receivedQty: purchaseOrderLine.receivedQty,
      unitPrice: purchaseOrderLine.unitPrice,
      lineTotal: purchaseOrderLine.lineTotal,
      expectedEta: purchaseOrderLine.expectedEta,
      notes: purchaseOrderLine.notes,
    })
    .from(purchaseOrderLine)
    .leftJoin(item, eq(purchaseOrderLine.itemId, item.id))
    .where(eq(purchaseOrderLine.poId, poId))
    .orderBy(purchaseOrderLine.lineNo);
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

export async function createPOFromPR(
  prId: string,
  userId: string | null,
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

    const lines = await tx
      .select()
      .from(purchaseRequestLine)
      .where(eq(purchaseRequestLine.prId, prId));
    if (lines.length === 0) throw new Error("PR_EMPTY");

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
  linkedOrderId?: string | null;
  expectedEta?: Date | null;
  currency?: string;
  notes?: string | null;
  createdBy: string | null;
  lines: Array<{
    itemId: string;
    orderedQty: number;
    unitPrice?: number;
    snapshotLineId?: string | null;
    expectedEta?: Date | null;
    notes?: string | null;
  }>;
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

    const [header] = await tx
      .insert(purchaseOrder)
      .values({
        poNo,
        supplierId: input.supplierId,
        linkedOrderId: input.linkedOrderId ?? null,
        expectedEta: input.expectedEta
          ? input.expectedEta.toISOString().slice(0, 10)
          : null,
        currency: input.currency ?? "VND",
        notes: input.notes ?? null,
        status: "DRAFT",
        createdBy: input.createdBy,
      })
      .returning();
    if (!header) throw new Error("PO_INSERT_FAILED");

    await tx.insert(purchaseOrderLine).values(
      input.lines.map((l, idx) => ({
        poId: header.id,
        lineNo: idx + 1,
        itemId: l.itemId,
        orderedQty: String(l.orderedQty),
        unitPrice: String(l.unitPrice ?? 0),
        snapshotLineId: l.snapshotLineId ?? null,
        expectedEta: l.expectedEta ? l.expectedEta.toISOString().slice(0, 10) : null,
        notes: l.notes ?? null,
      })),
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
