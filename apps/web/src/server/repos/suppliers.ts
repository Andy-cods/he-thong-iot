import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  aliasSupplier,
  finInvoice,
  finPayment,
  finTransaction,
  item,
  itemSupplier,
  purchaseOrder,
  purchaseOrderLine,
  purchaseRequestLine,
  supplier,
} from "@iot/db/schema";
import type { SupplierCreate, SupplierUpdate } from "@iot/shared";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { findSimilarSupplier, type SupplierNameCandidate } from "@/lib/supplier-dedupe";

/**
 * V1.9 P7 — List supplier kèm cột Khu vực + Số items + filter region/sort.
 * Giữ backward-compat với V1 list existing (thêm field optional).
 */
export async function listSuppliers(opts: {
  q?: string;
  region?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
  sort?: "code" | "name" | "region" | "createdAt";
}) {
  const where: SQL[] = [];
  if (opts.isActive !== undefined)
    where.push(eq(supplier.isActive, opts.isActive));
  if (opts.region && opts.region.trim()) {
    where.push(eq(supplier.region, opts.region.trim()));
  }
  if (opts.q && opts.q.trim()) {
    const needle = `%${opts.q.trim()}%`;
    const orExpr = or(
      ilike(supplier.code, needle),
      ilike(supplier.name, needle),
    );
    if (orExpr) where.push(orExpr);
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const sortCol =
    opts.sort === "name"
      ? asc(supplier.name)
      : opts.sort === "region"
        ? asc(supplier.region)
        : opts.sort === "createdAt"
          ? desc(supplier.createdAt)
          : asc(supplier.code);

  // Subquery COUNT item_supplier per supplier.
  const itemCountSub = db
    .select({
      supplierId: itemSupplier.supplierId,
      cnt: sql<number>`count(*)::int`.as("cnt"),
    })
    .from(itemSupplier)
    .groupBy(itemSupplier.supplierId)
    .as("item_count");

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(supplier)
      .where(whereExpr ?? sql`true`),
    db
      .select({
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        contactName: supplier.contactName,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        taxCode: supplier.taxCode,
        isActive: supplier.isActive,
        region: supplier.region,
        city: supplier.city,
        createdAt: supplier.createdAt,
        itemCount: sql<number>`coalesce(${itemCountSub.cnt}, 0)::int`,
      })
      .from(supplier)
      .leftJoin(itemCountSub, eq(itemCountSub.supplierId, supplier.id))
      .where(whereExpr ?? sql`true`)
      .orderBy(sortCol)
      .limit(opts.pageSize)
      .offset(offset),
  ]);
  return { rows, total: totalResult[0]?.count ?? 0 };
}

/** V1.9 P7 — list distinct region (để dropdown filter). */
export async function listSupplierRegions() {
  const rows = await db
    .select({
      region: supplier.region,
      cnt: sql<number>`count(*)::int`,
    })
    .from(supplier)
    .where(sql`${supplier.region} IS NOT NULL AND ${supplier.region} <> ''`)
    .groupBy(supplier.region)
    .orderBy(asc(supplier.region));
  return rows
    .filter((r) => typeof r.region === "string" && r.region.length > 0)
    .map((r) => ({ region: r.region as string, count: r.cnt ?? 0 }));
}

export async function getSupplierById(id: string) {
  const [row] = await db
    .select()
    .from(supplier)
    .where(eq(supplier.id, id))
    .limit(1);
  return row ?? null;
}

export async function getSupplierByCode(code: string) {
  const [row] = await db
    .select()
    .from(supplier)
    .where(eq(supplier.code, code.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export interface SimilarSupplierMatch {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  phone: string | null;
}

/**
 * V4.5 QA-A P1 — kiểm NCC trùng tên GẦN GIỐNG (không chỉ trùng tuyệt đối)
 * trước khi tạo mới, giống cơ chế `quickCreateItem` (items.ts). Candidate lấy
 * rộng bằng ILIKE 2 chiều (unaccent cả 2 vế — bắt cả ca tên dài chứa tên ngắn
 * lẫn tên ngắn gõ y hệt 1 phần tên dài), quyết định trùng thật bằng hàm THUẦN
 * `findSimilarSupplier` (lib/supplier-dedupe.ts — bỏ "Công ty"/"TNHH"/"CP"…).
 * Chỉ xét NCC đang hoạt động (NCC đã ngưng không cần cảnh báo trùng).
 */
export async function findSimilarActiveSupplier(
  name: string,
): Promise<SimilarSupplierMatch | null> {
  const needle = name.trim().replace(/\s+/g, " ");
  if (!needle) return null;
  const candidates = await db
    .select({
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      taxCode: supplier.taxCode,
      phone: supplier.phone,
    })
    .from(supplier)
    .where(
      and(
        eq(supplier.isActive, true),
        sql`unaccent(${supplier.name}) ILIKE unaccent('%' || ${needle} || '%')
            OR unaccent(${needle}) ILIKE unaccent('%' || ${supplier.name} || '%')`,
      ),
    )
    .limit(20);
  return findSimilarSupplier(needle, candidates as SupplierNameCandidate[]) as SimilarSupplierMatch | null;
}

export async function createSupplier(input: SupplierCreate) {
  const [row] = await db
    .insert(supplier)
    .values({
      code: input.code,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxCode: input.taxCode ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      ward: input.ward ?? null,
      streetAddress: input.streetAddress ?? null,
      factoryAddress: input.factoryAddress ?? null,
      latitude:
        input.latitude === null || input.latitude === undefined
          ? null
          : String(input.latitude),
      longitude:
        input.longitude === null || input.longitude === undefined
          ? null
          : String(input.longitude),
      website: input.website ?? null,
      bankInfo: input.bankInfo ?? null,
      paymentTerms: input.paymentTerms ?? null,
      contactPersons: input.contactPersons ?? null,
      internalNotes: input.internalNotes ?? null,
    })
    .returning();
  return row;
}

export async function updateSupplier(id: string, input: SupplierUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.contactName !== undefined) patch.contactName = input.contactName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.address !== undefined) patch.address = input.address;
  if (input.taxCode !== undefined) patch.taxCode = input.taxCode;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.region !== undefined) patch.region = input.region;
  if (input.city !== undefined) patch.city = input.city;
  if (input.ward !== undefined) patch.ward = input.ward;
  if (input.streetAddress !== undefined)
    patch.streetAddress = input.streetAddress;
  if (input.factoryAddress !== undefined)
    patch.factoryAddress = input.factoryAddress;
  if (input.latitude !== undefined)
    patch.latitude = input.latitude === null ? null : String(input.latitude);
  if (input.longitude !== undefined)
    patch.longitude =
      input.longitude === null ? null : String(input.longitude);
  if (input.website !== undefined) patch.website = input.website;
  if (input.bankInfo !== undefined) patch.bankInfo = input.bankInfo;
  if (input.paymentTerms !== undefined)
    patch.paymentTerms = input.paymentTerms;
  if (input.contactPersons !== undefined)
    patch.contactPersons = input.contactPersons;
  if (input.internalNotes !== undefined)
    patch.internalNotes = input.internalNotes;

  const [row] = await db
    .update(supplier)
    .set(patch)
    .where(eq(supplier.id, id))
    .returning();
  return row ?? null;
}

export async function softDeleteSupplier(id: string) {
  const [row] = await db
    .update(supplier)
    .set({ isActive: false })
    .where(eq(supplier.id, id))
    .returning();
  return row ?? null;
}

/* ============================================================================
 * TASK-6VIEC Việc 3 — Gộp NCC trùng (chỉ admin). Mọi FK supplier_id ở các
 * bảng purchase_order, fin_invoice, fin_payment, fin_transaction,
 * item_supplier, purchase_request_line.preferred_supplier_id + alias_supplier
 * chuyển sang NCC GIỮ LẠI (targetId); NCC nguồn (sourceId) đánh dấu
 * is_active=false + ghi chú — KHÔNG xoá cứng (giữ nguyên lịch sử/audit).
 * ============================================================================ */

export interface SupplierMergeCounts {
  purchaseOrderCount: number;
  finInvoiceCount: number;
  finPaymentCount: number;
  finTransactionCount: number;
  itemSupplierCount: number;
  aliasCount: number;
  prLineCount: number;
}

/** Đếm số tham chiếu sẽ CHUYỂN sang NCC đích nếu gộp sourceId — màn xác nhận. */
export async function getSupplierMergeCounts(
  sourceId: string,
): Promise<SupplierMergeCounts> {
  const count = sql<number>`count(*)::int`;
  const [po, inv, pay, txn, isup, alias, prl] = await Promise.all([
    db.select({ c: count }).from(purchaseOrder).where(eq(purchaseOrder.supplierId, sourceId)),
    db.select({ c: count }).from(finInvoice).where(eq(finInvoice.supplierId, sourceId)),
    db.select({ c: count }).from(finPayment).where(eq(finPayment.supplierId, sourceId)),
    db.select({ c: count }).from(finTransaction).where(eq(finTransaction.supplierId, sourceId)),
    db.select({ c: count }).from(itemSupplier).where(eq(itemSupplier.supplierId, sourceId)),
    db.select({ c: count }).from(aliasSupplier).where(eq(aliasSupplier.supplierId, sourceId)),
    db
      .select({ c: count })
      .from(purchaseRequestLine)
      .where(eq(purchaseRequestLine.preferredSupplierId, sourceId)),
  ]);
  return {
    purchaseOrderCount: po[0]?.c ?? 0,
    finInvoiceCount: inv[0]?.c ?? 0,
    finPaymentCount: pay[0]?.c ?? 0,
    finTransactionCount: txn[0]?.c ?? 0,
    itemSupplierCount: isup[0]?.c ?? 0,
    aliasCount: alias[0]?.c ?? 0,
    prLineCount: prl[0]?.c ?? 0,
  };
}

export interface SupplierMergeResult {
  moved: SupplierMergeCounts;
  itemSupplierConflictsResolved: number;
  finInvoiceConflictsRenamed: number;
}

export class SupplierMergeError extends Error {}

/**
 * Gộp sourceId VÀO targetId: chuyển MỌI FK supplier_id sang targetId, đánh
 * dấu sourceId is_active=false. 1 TRANSACTION duy nhất — lỗi giữa chừng
 * rollback toàn bộ (không có trạng thái "gộp dở").
 *
 * Xung đột unique:
 *  - item_supplier (item_id, supplier_id): giữ bản MỚI HƠN (createdAt lớn
 *    hơn), xoá bản còn lại — đúng yêu cầu "giữ bản mới hơn/gộp".
 *  - fin_invoice (direction, invoice_no, supplier_id): GIỮ CẢ 2 (không mất
 *    chứng từ tài chính) — hậu tố invoiceNo của hoá đơn nguồn bằng mã NCC cũ
 *    để phân biệt khi trùng số hoá đơn giữa 2 NCC.
 *  - purchase_order / fin_payment / fin_transaction /
 *    purchase_request_line.preferred_supplier_id / alias_supplier: không có
 *    unique theo supplier → update thẳng.
 */
export async function mergeSuppliers(
  sourceId: string,
  targetId: string,
): Promise<SupplierMergeResult> {
  if (sourceId === targetId) {
    throw new SupplierMergeError("Không thể gộp NCC vào chính nó.");
  }

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(supplier)
      .where(eq(supplier.id, sourceId))
      .limit(1);
    if (!source) throw new SupplierMergeError("Không tìm thấy NCC nguồn.");
    const [target] = await tx
      .select()
      .from(supplier)
      .where(eq(supplier.id, targetId))
      .limit(1);
    if (!target) throw new SupplierMergeError("Không tìm thấy NCC đích.");

    const poRes = await tx
      .update(purchaseOrder)
      .set({ supplierId: targetId })
      .where(eq(purchaseOrder.supplierId, sourceId))
      .returning({ id: purchaseOrder.id });

    const payRes = await tx
      .update(finPayment)
      .set({ supplierId: targetId })
      .where(eq(finPayment.supplierId, sourceId))
      .returning({ id: finPayment.id });

    const txnRes = await tx
      .update(finTransaction)
      .set({ supplierId: targetId })
      .where(eq(finTransaction.supplierId, sourceId))
      .returning({ id: finTransaction.id });

    const prlRes = await tx
      .update(purchaseRequestLine)
      .set({ preferredSupplierId: targetId })
      .where(eq(purchaseRequestLine.preferredSupplierId, sourceId))
      .returning({ id: purchaseRequestLine.id });

    const aliasRes = await tx
      .update(aliasSupplier)
      .set({ supplierId: targetId })
      .where(eq(aliasSupplier.supplierId, sourceId))
      .returning({ id: aliasSupplier.id });

    const sourceInvoices = await tx
      .select({
        id: finInvoice.id,
        direction: finInvoice.direction,
        invoiceNo: finInvoice.invoiceNo,
      })
      .from(finInvoice)
      .where(eq(finInvoice.supplierId, sourceId));
    let finInvoiceConflictsRenamed = 0;
    for (const inv of sourceInvoices) {
      const [clash] = await tx
        .select({ id: finInvoice.id })
        .from(finInvoice)
        .where(
          and(
            eq(finInvoice.supplierId, targetId),
            eq(finInvoice.direction, inv.direction),
            eq(finInvoice.invoiceNo, inv.invoiceNo),
          ),
        )
        .limit(1);
      if (clash) {
        finInvoiceConflictsRenamed += 1;
        await tx
          .update(finInvoice)
          .set({
            supplierId: targetId,
            invoiceNo: `${inv.invoiceNo}-GOP-${source.code}`,
          })
          .where(eq(finInvoice.id, inv.id));
      } else {
        await tx
          .update(finInvoice)
          .set({ supplierId: targetId })
          .where(eq(finInvoice.id, inv.id));
      }
    }

    const sourceItemSuppliers = await tx
      .select()
      .from(itemSupplier)
      .where(eq(itemSupplier.supplierId, sourceId));
    let itemSupplierConflictsResolved = 0;
    for (const row of sourceItemSuppliers) {
      const [clash] = await tx
        .select()
        .from(itemSupplier)
        .where(
          and(eq(itemSupplier.itemId, row.itemId), eq(itemSupplier.supplierId, targetId)),
        )
        .limit(1);
      if (clash) {
        itemSupplierConflictsResolved += 1;
        const sourceIsNewer =
          new Date(row.createdAt).getTime() > new Date(clash.createdAt).getTime();
        if (sourceIsNewer) {
          await tx.delete(itemSupplier).where(eq(itemSupplier.id, clash.id));
          await tx
            .update(itemSupplier)
            .set({ supplierId: targetId })
            .where(eq(itemSupplier.id, row.id));
        } else {
          await tx.delete(itemSupplier).where(eq(itemSupplier.id, row.id));
        }
      } else {
        await tx
          .update(itemSupplier)
          .set({ supplierId: targetId })
          .where(eq(itemSupplier.id, row.id));
      }
    }

    const mergedNote = `[Đã gộp vào ${target.code} — ${target.name} lúc ${formatDateTime(new Date())}]`;
    await tx
      .update(supplier)
      .set({
        isActive: false,
        internalNotes: source.internalNotes
          ? `${source.internalNotes}\n${mergedNote}`
          : mergedNote,
      })
      .where(eq(supplier.id, sourceId));

    return {
      moved: {
        purchaseOrderCount: poRes.length,
        finInvoiceCount: sourceInvoices.length,
        finPaymentCount: payRes.length,
        finTransactionCount: txnRes.length,
        itemSupplierCount: sourceItemSuppliers.length,
        aliasCount: aliasRes.length,
        prLineCount: prlRes.length,
      },
      itemSupplierConflictsResolved,
      finInvoiceConflictsRenamed,
    };
  });
}

/* ============================================================================
 * V1.9 P7 — Items supplied + top-items + PO stats
 * ============================================================================ */

/**
 * List items mà supplier này đang cung cấp (join item_supplier ↔ item).
 * Trả về đầy đủ metadata cần thiết cho UI tab "Vật liệu cung cấp".
 */
export async function listItemsSuppliedBy(
  supplierId: string,
  opts: {
    q?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const where: SQL[] = [eq(itemSupplier.supplierId, supplierId)];
  if (opts.q && opts.q.trim()) {
    const needle = `%${opts.q.trim()}%`;
    const orExpr = or(ilike(item.sku, needle), ilike(item.name, needle));
    if (orExpr) where.push(orExpr);
  }
  if (opts.category && opts.category.trim()) {
    where.push(eq(item.category, opts.category.trim()));
  }

  const rows = await db
    .select({
      id: itemSupplier.id,
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      uom: item.uom,
      isActive: item.isActive,
      supplierSku: itemSupplier.supplierSku,
      vendorItemCode: itemSupplier.vendorItemCode,
      priceRef: itemSupplier.priceRef,
      currency: itemSupplier.currency,
      leadTimeDays: itemSupplier.leadTimeDays,
      moq: itemSupplier.moq,
      packSize: itemSupplier.packSize,
      isPreferred: itemSupplier.isPreferred,
      createdAt: itemSupplier.createdAt,
    })
    .from(itemSupplier)
    .innerJoin(item, eq(item.id, itemSupplier.itemId))
    .where(and(...where))
    .orderBy(desc(itemSupplier.isPreferred), asc(item.sku))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);

  // Total count (no limit).
  const [countRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(itemSupplier)
    .innerJoin(item, eq(item.id, itemSupplier.itemId))
    .where(and(...where));

  return { rows, total: countRow?.cnt ?? 0 };
}

/**
 * Top items mua nhiều nhất từ supplier (aggregate PO lines).
 * Chỉ tính PO không bị CANCELLED.
 */
export async function getTopItemsBoughtFromSupplier(
  supplierId: string,
  limit = 20,
) {
  const rows = await db
    .select({
      itemId: purchaseOrderLine.itemId,
      sku: item.sku,
      name: item.name,
      uom: item.uom,
      poCount: sql<number>`count(distinct ${purchaseOrder.id})::int`,
      totalQty: sql<number>`coalesce(sum(${purchaseOrderLine.orderedQty}), 0)::numeric`,
      totalSpend: sql<number>`coalesce(sum(${purchaseOrderLine.orderedQty} * ${purchaseOrderLine.unitPrice}), 0)::numeric`,
      avgUnitPrice: sql<number>`coalesce(avg(${purchaseOrderLine.unitPrice}), 0)::numeric`,
      lastOrderDate: sql<string | null>`max(${purchaseOrder.orderDate})`,
    })
    .from(purchaseOrderLine)
    .innerJoin(
      purchaseOrder,
      eq(purchaseOrder.id, purchaseOrderLine.poId),
    )
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(
      and(
        eq(purchaseOrder.supplierId, supplierId),
        sql`${purchaseOrder.status} <> 'CANCELLED'`,
      ),
    )
    .groupBy(purchaseOrderLine.itemId, item.sku, item.name, item.uom)
    .orderBy(
      desc(
        sql`sum(${purchaseOrderLine.orderedQty} * ${purchaseOrderLine.unitPrice})`,
      ),
    )
    .limit(limit);
  return rows;
}

/**
 * KPI PO của supplier: total PO, YTD spend, avg lead time (ước lượng từ
 * item_supplier), recent PO list.
 */
export async function getSupplierPoStats(supplierId: string) {
  // startOfYear lấy theo server TZ.
  const now = new Date();
  const year = now.getUTCFullYear();
  const startOfYear = `${year}-01-01`;

  const [totalsRow] = await db
    .select({
      poCount: sql<number>`count(*)::int`,
      totalSpend: sql<number>`coalesce(sum(${purchaseOrder.totalAmount}), 0)::numeric`,
    })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.supplierId, supplierId),
        sql`${purchaseOrder.status} <> 'CANCELLED'`,
      ),
    );

  const [ytdRow] = await db
    .select({
      ytdSpend: sql<number>`coalesce(sum(${purchaseOrder.totalAmount}), 0)::numeric`,
      ytdCount: sql<number>`count(*)::int`,
    })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.supplierId, supplierId),
        sql`${purchaseOrder.status} <> 'CANCELLED'`,
        gte(purchaseOrder.orderDate, startOfYear),
      ),
    );

  const [leadTimeRow] = await db
    .select({
      avgLeadTime: sql<number>`coalesce(avg(${itemSupplier.leadTimeDays}), 0)::numeric`,
    })
    .from(itemSupplier)
    .where(eq(itemSupplier.supplierId, supplierId));

  // On-time rate: % PO có received đúng expectedEta (heuristic V1).
  // Tạm tính = PO status = RECEIVED / total (chưa CANCELLED). Không có timeline
  // chính xác → trả về 0 nếu không có PO.
  const [receivedRow] = await db
    .select({
      cnt: sql<number>`count(*)::int`,
    })
    .from(purchaseOrder)
    .where(
      and(
        eq(purchaseOrder.supplierId, supplierId),
        sql`${purchaseOrder.status} IN ('RECEIVED', 'CLOSED')`,
      ),
    );

  const totalPo = Number(totalsRow?.poCount ?? 0);
  const totalReceived = Number(receivedRow?.cnt ?? 0);
  const onTimeRate = totalPo > 0 ? (totalReceived / totalPo) * 100 : 0;

  // Recent 10 PO
  const recent = await db
    .select({
      id: purchaseOrder.id,
      poNo: purchaseOrder.poNo,
      status: purchaseOrder.status,
      orderDate: purchaseOrder.orderDate,
      expectedEta: purchaseOrder.expectedEta,
      totalAmount: purchaseOrder.totalAmount,
      currency: purchaseOrder.currency,
    })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.supplierId, supplierId))
    .orderBy(desc(purchaseOrder.orderDate), desc(purchaseOrder.createdAt))
    .limit(10);

  return {
    totalPoCount: totalPo,
    totalSpend: Number(totalsRow?.totalSpend ?? 0),
    ytdSpend: Number(ytdRow?.ytdSpend ?? 0),
    ytdPoCount: Number(ytdRow?.ytdCount ?? 0),
    avgLeadTimeDays: Number(leadTimeRow?.avgLeadTime ?? 0),
    onTimeRate: Math.round(onTimeRate * 10) / 10,
    recentPurchaseOrders: recent,
  };
}
