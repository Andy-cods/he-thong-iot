import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { item, itemBarcode, itemSupplier } from "@iot/db/schema";
import type {
  ItemCreate,
  ItemListQuery,
  ItemUpdate,
} from "@iot/shared";
import { db } from "@/lib/db";

export interface ItemInventorySummary {
  totalQty: number;
  availableQty: number;
  reservedQty: number;
}

export interface ItemListRow {
  id: string;
  sku: string;
  name: string;
  itemType: string;
  uom: string;
  status: string;
  category: string | null;
  isActive: boolean;
  minStockQty: string;
  reorderQty: string;
  leadTimeDays: number;
  primaryBarcode: string | null;
  supplierCount: number;
  /** V1.9 P6: inventory aggregate (totalQty via inventory_txn, available/reserved via lot_serial). */
  inventorySummary: ItemInventorySummary;
  updatedAt: Date;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface ListItemsResult {
  rows: ItemListRow[];
  total: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_MAP: Record<string, { col: any; dir: "asc" | "desc" }> = {
  sku: { col: item.sku, dir: "asc" },
  "-sku": { col: item.sku, dir: "desc" },
  name: { col: item.name, dir: "asc" },
  "-name": { col: item.name, dir: "desc" },
  updatedAt: { col: item.updatedAt, dir: "asc" },
  "-updatedAt": { col: item.updatedAt, dir: "desc" },
  createdAt: { col: item.createdAt, dir: "asc" },
  "-createdAt": { col: item.createdAt, dir: "desc" },
};

/** List items với filter + search unaccent/trgm + pagination. */
export async function listItems(q: ItemListQuery): Promise<ListItemsResult> {
  const where: SQL[] = [];

  if (q.isActive !== undefined) {
    where.push(eq(item.isActive, q.isActive));
  }
  if (q.type && q.type.length > 0) {
    where.push(
      inArray(
        item.itemType,
        q.type as unknown as (typeof item.itemType.enumValues)[number][],
      ),
    );
  }
  if (q.uom && q.uom.length > 0) {
    where.push(
      inArray(
        item.uom,
        q.uom as unknown as (typeof item.uom.enumValues)[number][],
      ),
    );
  }
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        item.status,
        q.status as unknown as (typeof item.status.enumValues)[number][],
      ),
    );
  }
  if (q.q && q.q.trim().length > 0) {
    const needle = q.q.trim();
    // unaccent + trigram similarity + fallback ILIKE. % operator dùng gin_trgm_ops index.
    where.push(
      sql`(
        unaccent(${item.name}) ILIKE unaccent('%' || ${needle} || '%')
        OR ${item.sku} ILIKE upper('%' || ${needle} || '%')
        OR ${item.category} ILIKE ('%' || ${needle} || '%')
      )`,
    );
  }

  // V1.9 P6 — filter theo category (single) hoặc categories[] (multi).
  if (q.category && q.category.length > 0) {
    where.push(eq(item.category, q.category));
  }
  if (q.categories && q.categories.length > 0) {
    where.push(inArray(item.category, q.categories));
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const sort = SORT_MAP[q.sort] ?? SORT_MAP["-updatedAt"]!;
  const orderExpr = sort!.dir === "asc" ? asc(sort!.col as never) : desc(sort!.col as never);

  const offset = (q.page - 1) * q.pageSize;

  // Count riêng để meta chuẩn. Query pg_trgm GIN vẫn O(log n) sort by updatedAt.
  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(item)
      .where(whereExpr ?? sql`true`),
    db
      .select({
        id: item.id,
        sku: item.sku,
        name: item.name,
        itemType: item.itemType,
        uom: item.uom,
        status: item.status,
        category: item.category,
        isActive: item.isActive,
        minStockQty: item.minStockQty,
        reorderQty: item.reorderQty,
        leadTimeDays: item.leadTimeDays,
        updatedAt: item.updatedAt,
        primaryBarcode: sql<string | null>`(
          SELECT b.barcode FROM ${itemBarcode} b
          WHERE b.item_id = ${item.id} AND b.is_primary = true
          LIMIT 1
        )`,
        supplierCount: sql<number>`(
          SELECT count(*)::int FROM ${itemSupplier} s
          WHERE s.item_id = ${item.id}
        )`,
        // V1.9 P6 — inventory aggregate subqueries (indexed item_id):
        totalQty: sql<string>`(
          SELECT COALESCE(SUM(
            CASE
              WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
              WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
              ELSE 0
            END
          ), 0)::text
          FROM app.inventory_txn t
          WHERE t.item_id = ${item.id}
        )`,
        reservedQty: sql<string>`(
          SELECT COALESCE(SUM(r.reserved_qty), 0)::text
          FROM app.reservation r
          JOIN app.inventory_lot_serial ll ON ll.id = r.lot_serial_id
          WHERE ll.item_id = ${item.id} AND r.status = 'ACTIVE'
        )`,
      })
      .from(item)
      .where(whereExpr ?? sql`true`)
      .orderBy(orderExpr)
      .limit(q.pageSize)
      .offset(offset),
  ]);

  // Map rows → ItemListRow: totalQty/reservedQty text → number, availableQty = total - reserved.
  type RawRow = Omit<ItemListRow, "inventorySummary"> & {
    totalQty: string;
    reservedQty: string;
  };
  const mapped: ItemListRow[] = (rows as RawRow[]).map((r) => {
    const total = Number(r.totalQty ?? 0) || 0;
    const reserved = Number(r.reservedQty ?? 0) || 0;
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      itemType: r.itemType,
      uom: r.uom,
      status: r.status,
      category: r.category,
      isActive: r.isActive,
      minStockQty: r.minStockQty,
      reorderQty: r.reorderQty,
      leadTimeDays: r.leadTimeDays,
      primaryBarcode: r.primaryBarcode,
      supplierCount: r.supplierCount,
      updatedAt: r.updatedAt,
      inventorySummary: {
        totalQty: total,
        availableQty: Math.max(0, total - reserved),
        reservedQty: reserved,
      },
    };
  });

  return {
    rows: mapped,
    total: totalResult[0]?.count ?? 0,
  };
}

/**
 * V1.9 P6 — distinct categories + count. Dùng cho dropdown filter.
 * Chỉ đếm category NOT NULL, chỉ active items (isActive=true) để tránh
 * confuse user với category của soft-deleted items.
 */
export async function listItemCategories(): Promise<CategoryCount[]> {
  const rows = (await db.execute(sql`
    SELECT
      category::text AS category,
      COUNT(*)::int AS count
    FROM app.item
    WHERE category IS NOT NULL AND is_active = true
    GROUP BY category
    ORDER BY count DESC, category ASC
  `)) as unknown as Array<{ category: string; count: number }>;

  return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
}

export async function getItemById(id: string) {
  const [row] = await db
    .select()
    .from(item)
    .where(eq(item.id, id))
    .limit(1);
  return row ?? null;
}

export async function getItemBySku(sku: string) {
  const [row] = await db
    .select()
    .from(item)
    .where(eq(item.sku, sku.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function checkSkuExists(sku: string): Promise<boolean> {
  const [row] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.sku, sku.toUpperCase()))
    .limit(1);
  return !!row;
}

export async function createItem(input: ItemCreate, actorId: string | null) {
  const [row] = await db
    .insert(item)
    .values({
      sku: input.sku,
      name: input.name,
      itemType: input.itemType,
      uom: input.uom,
      status: input.status,
      category: input.category ?? null,
      description: input.description ?? null,
      minStockQty: String(input.minStockQty),
      reorderQty: String(input.reorderQty),
      leadTimeDays: input.leadTimeDays,
      isLotTracked: input.isLotTracked,
      isSerialTracked: input.isSerialTracked,
      createdBy: actorId,
      updatedBy: actorId,
    })
    .returning();
  return row;
}

export async function updateItem(
  id: string,
  input: ItemUpdate,
  actorId: string | null,
) {
  const patch: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.itemType !== undefined) patch.itemType = input.itemType;
  if (input.uom !== undefined) patch.uom = input.uom;
  if (input.status !== undefined) patch.status = input.status;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description;
  if (input.minStockQty !== undefined) patch.minStockQty = String(input.minStockQty);
  if (input.reorderQty !== undefined) patch.reorderQty = String(input.reorderQty);
  if (input.leadTimeDays !== undefined) patch.leadTimeDays = input.leadTimeDays;
  if (input.isLotTracked !== undefined) patch.isLotTracked = input.isLotTracked;
  if (input.isSerialTracked !== undefined) patch.isSerialTracked = input.isSerialTracked;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [row] = await db
    .update(item)
    .set(patch)
    .where(eq(item.id, id))
    .returning();
  return row ?? null;
}

export async function softDeleteItem(id: string, actorId: string | null) {
  const [row] = await db
    .update(item)
    .set({ isActive: false, updatedBy: actorId, updatedAt: new Date() })
    .where(and(eq(item.id, id), isNotNull(item.id)))
    .returning();
  return row ?? null;
}

export async function restoreItem(id: string, actorId: string | null) {
  const [row] = await db
    .update(item)
    .set({ isActive: true, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(item.id, id))
    .returning();
  return row ?? null;
}
