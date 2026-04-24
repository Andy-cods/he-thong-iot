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
  item,
  itemSupplier,
  purchaseOrder,
  purchaseOrderLine,
  supplier,
} from "@iot/db/schema";
import type { SupplierCreate, SupplierUpdate } from "@iot/shared";
import { db } from "@/lib/db";

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
