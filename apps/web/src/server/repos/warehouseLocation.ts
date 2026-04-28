import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  inventoryLotSerial,
  item,
  locationBin,
  warehousePutaway,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V3.6 — Warehouse Location System repository.
 *
 * Cấu trúc bin: A-01-2-03 (Khu-Kệ-Ngăn-Ô).
 * Source-of-truth qty: view `app.bin_inventory` aggregate từ inventory_txn.
 */

export interface BinRow {
  id: string;
  fullCode: string;
  area: string | null;
  rack: string | null;
  levelNo: number | null;
  position: string | null;
  capacity: string | null;
  lowThreshold: string | null;
  coordX: string | null;
  coordY: string | null;
  coordZ: string | null;
  isActive: boolean;
  description: string | null;
}

export interface BinWithStock extends BinRow {
  /** Tổng qty hiện tại trên bin (tất cả lot/item). */
  totalQty: number;
  /** Số SKU distinct trên bin. */
  skuCount: number;
  /** Số lot distinct. */
  lotCount: number;
  /** True nếu < lowThreshold. */
  isLow: boolean;
}

/** Liệt kê tất cả bins với stock summary — dùng cho 3D layout map. */
export async function listBinsWithStock(): Promise<BinWithStock[]> {
  const rows = await db.execute<{
    id: string;
    full_code: string;
    area: string | null;
    rack: string | null;
    level_no: number | null;
    position: string | null;
    capacity: string | null;
    low_threshold: string | null;
    coord_x: string | null;
    coord_y: string | null;
    coord_z: string | null;
    is_active: boolean;
    description: string | null;
    total_qty: string | null;
    sku_count: number;
    lot_count: number;
  }>(sql`
    SELECT
      lb.id,
      lb.full_code,
      lb.area, lb.rack, lb.level_no, lb.position,
      lb.capacity::text, lb.low_threshold::text,
      lb.coord_x::text, lb.coord_y::text, lb.coord_z::text,
      lb.is_active,
      lb.description,
      COALESCE(SUM(bi.qty_on_hand), 0)::text AS total_qty,
      COUNT(DISTINCT bi.item_id)::int        AS sku_count,
      COUNT(DISTINCT bi.lot_serial_id)::int  AS lot_count
    FROM app.location_bin lb
    LEFT JOIN app.bin_inventory bi ON bi.bin_id = lb.id
    WHERE lb.is_active = TRUE
    GROUP BY lb.id
    ORDER BY lb.area, lb.rack, lb.level_no, lb.position
  `);

  return (rows as unknown as Array<typeof rows[number]>).map((r) => {
    const total = Number(r.total_qty ?? "0");
    const lowT = Number(r.low_threshold ?? "0");
    return {
      id: r.id,
      fullCode: r.full_code,
      area: r.area,
      rack: r.rack,
      levelNo: r.level_no,
      position: r.position,
      capacity: r.capacity,
      lowThreshold: r.low_threshold,
      coordX: r.coord_x,
      coordY: r.coord_y,
      coordZ: r.coord_z,
      isActive: r.is_active,
      description: r.description,
      totalQty: total,
      skuCount: r.sku_count,
      lotCount: r.lot_count,
      isLow: lowT > 0 && total > 0 && total < lowT,
    };
  });
}

export interface BinDetailContent {
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  lotSerialId: string;
  lotCode: string | null;
  serialCode: string | null;
  qty: number;
  mfgDate: string | null;
  expDate: string | null;
  status: string;
}

/** Lấy chi tiết content của 1 bin (lots + items + qty). */
export async function getBinContent(binId: string): Promise<BinDetailContent[]> {
  const rows = await db.execute<{
    item_id: string;
    item_sku: string | null;
    item_name: string | null;
    item_uom: string | null;
    lot_serial_id: string;
    lot_code: string | null;
    serial_code: string | null;
    qty: string;
    mfg_date: string | null;
    exp_date: string | null;
    status: string;
  }>(sql`
    SELECT
      bi.item_id,
      it.sku   AS item_sku,
      it.name  AS item_name,
      it.uom   AS item_uom,
      bi.lot_serial_id,
      ils.lot_code,
      ils.serial_code,
      bi.qty_on_hand::text AS qty,
      ils.mfg_date::text   AS mfg_date,
      ils.exp_date::text   AS exp_date,
      ils.status::text
    FROM app.bin_inventory bi
    LEFT JOIN app.item it ON it.id = bi.item_id
    LEFT JOIN app.inventory_lot_serial ils ON ils.id = bi.lot_serial_id
    WHERE bi.bin_id = ${binId}
    ORDER BY ils.created_at ASC
  `);
  return (rows as unknown as Array<typeof rows[number]>).map((r) => ({
    itemId: r.item_id,
    itemSku: r.item_sku,
    itemName: r.item_name,
    itemUom: r.item_uom,
    lotSerialId: r.lot_serial_id,
    lotCode: r.lot_code,
    serialCode: r.serial_code,
    qty: Number(r.qty ?? "0"),
    mfgDate: r.mfg_date,
    expDate: r.exp_date,
    status: r.status,
  }));
}

export interface SkuLocationRow {
  binId: string;
  binFullCode: string;
  area: string | null;
  rack: string | null;
  levelNo: number | null;
  position: string | null;
  lotSerialId: string;
  lotCode: string | null;
  serialCode: string | null;
  qty: number;
  mfgDate: string | null;
  expDate: string | null;
  status: string;
}

/** Lookup SKU/tên → tất cả vị trí + lot + qty (cho ô tìm kiếm). */
export async function lookupSku(query: string): Promise<{
  matchedItems: Array<{ id: string; sku: string; name: string; uom: string | null }>;
  locations: SkuLocationRow[];
}> {
  const q = `%${query.trim()}%`;
  const items = await db
    .select({
      id: item.id,
      sku: item.sku,
      name: item.name,
      uom: item.uom,
    })
    .from(item)
    .where(
      and(
        eq(item.isActive, true),
        or(ilike(item.sku, q), ilike(item.name, q)),
      ),
    )
    .limit(20);

  if (items.length === 0) return { matchedItems: [], locations: [] };

  const itemIds = items.map((i) => i.id);
  const locs = await db.execute<{
    bin_id: string;
    bin_full_code: string;
    area: string | null;
    rack: string | null;
    level_no: number | null;
    position: string | null;
    item_id: string;
    lot_serial_id: string;
    lot_code: string | null;
    serial_code: string | null;
    qty: string;
    mfg_date: string | null;
    exp_date: string | null;
    status: string;
  }>(sql`
    SELECT
      bi.bin_id,
      lb.full_code AS bin_full_code,
      lb.area, lb.rack, lb.level_no, lb.position,
      bi.item_id,
      bi.lot_serial_id,
      ils.lot_code,
      ils.serial_code,
      bi.qty_on_hand::text AS qty,
      ils.mfg_date::text   AS mfg_date,
      ils.exp_date::text   AS exp_date,
      ils.status::text
    FROM app.bin_inventory bi
    JOIN app.location_bin lb ON lb.id = bi.bin_id
    LEFT JOIN app.inventory_lot_serial ils ON ils.id = bi.lot_serial_id
    WHERE bi.item_id IN (${sql.join(itemIds.map((id) => sql`${id}::uuid`), sql`, `)})
    ORDER BY ils.created_at ASC
  `);

  return {
    matchedItems: items,
    locations: (locs as unknown as Array<typeof locs[number]>).map((r) => ({
      binId: r.bin_id,
      binFullCode: r.bin_full_code,
      area: r.area,
      rack: r.rack,
      levelNo: r.level_no,
      position: r.position,
      lotSerialId: r.lot_serial_id,
      lotCode: r.lot_code,
      serialCode: r.serial_code,
      qty: Number(r.qty ?? "0"),
      mfgDate: r.mfg_date,
      expDate: r.exp_date,
      status: r.status,
    })),
  };
}

export interface FifoPickSuggestion {
  lotSerialId: string;
  lotCode: string | null;
  binId: string;
  binFullCode: string;
  qty: number;
  /** Ngày nhập kho (createdAt của lot — proxy cho FIFO). */
  receivedAt: string;
  expDate: string | null;
}

/** FIFO pick — gợi ý lot cũ nhất cho item. Trả về plan picks tổng = qty needed. */
export async function suggestFifoPicks(
  itemId: string,
  qtyNeeded: number,
): Promise<{ picks: FifoPickSuggestion[]; covered: number; shortage: number }> {
  const rows = await db.execute<{
    lot_serial_id: string;
    lot_code: string | null;
    bin_id: string;
    bin_full_code: string;
    qty: string;
    received_at: string;
    exp_date: string | null;
  }>(sql`
    SELECT
      bi.lot_serial_id,
      ils.lot_code,
      bi.bin_id,
      lb.full_code AS bin_full_code,
      bi.qty_on_hand::text AS qty,
      ils.created_at::text AS received_at,
      ils.exp_date::text   AS exp_date
    FROM app.bin_inventory bi
    JOIN app.inventory_lot_serial ils ON ils.id = bi.lot_serial_id
    JOIN app.location_bin lb ON lb.id = bi.bin_id
    WHERE bi.item_id = ${itemId}
      AND ils.status = 'AVAILABLE'
    ORDER BY ils.created_at ASC, bi.qty_on_hand DESC
  `);

  const picks: FifoPickSuggestion[] = [];
  let remaining = qtyNeeded;
  for (const r of rows as unknown as Array<typeof rows[number]>) {
    if (remaining <= 0) break;
    const available = Number(r.qty ?? "0");
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    picks.push({
      lotSerialId: r.lot_serial_id,
      lotCode: r.lot_code,
      binId: r.bin_id,
      binFullCode: r.bin_full_code,
      qty: take,
      receivedAt: r.received_at,
      expDate: r.exp_date,
    });
    remaining -= take;
  }

  return {
    picks,
    covered: qtyNeeded - remaining,
    shortage: Math.max(0, remaining),
  };
}

export interface WarehouseStats {
  totalBins: number;
  occupiedBins: number;
  emptyBins: number;
  lowStockBins: number;
  totalSKUs: number;
  totalLots: number;
  totalQty: number;
}

export async function getWarehouseStats(): Promise<WarehouseStats> {
  const [row] = await db.execute<{
    total_bins: number;
    occupied_bins: number;
    empty_bins: number;
    low_stock_bins: number;
    total_skus: number;
    total_lots: number;
    total_qty: string;
  }>(sql`
    WITH bin_summary AS (
      SELECT
        lb.id,
        lb.low_threshold,
        COALESCE(SUM(bi.qty_on_hand), 0) AS qty,
        COUNT(DISTINCT bi.item_id)        AS sku_cnt
      FROM app.location_bin lb
      LEFT JOIN app.bin_inventory bi ON bi.bin_id = lb.id
      WHERE lb.is_active = TRUE
      GROUP BY lb.id, lb.low_threshold
    )
    SELECT
      COUNT(*)::int                                   AS total_bins,
      COUNT(*) FILTER (WHERE qty > 0)::int            AS occupied_bins,
      COUNT(*) FILTER (WHERE qty = 0)::int            AS empty_bins,
      COUNT(*) FILTER (WHERE low_threshold IS NOT NULL AND low_threshold > 0 AND qty > 0 AND qty < low_threshold)::int AS low_stock_bins,
      COALESCE(SUM(sku_cnt), 0)::int                  AS total_skus,
      (SELECT COUNT(DISTINCT lot_serial_id)::int FROM app.bin_inventory) AS total_lots,
      COALESCE(SUM(qty), 0)::text                     AS total_qty
    FROM bin_summary
  `);

  return {
    totalBins: row?.total_bins ?? 0,
    occupiedBins: row?.occupied_bins ?? 0,
    emptyBins: row?.empty_bins ?? 0,
    lowStockBins: row?.low_stock_bins ?? 0,
    totalSKUs: row?.total_skus ?? 0,
    totalLots: row?.total_lots ?? 0,
    totalQty: Number(row?.total_qty ?? "0"),
  };
}

/** Putaway: gắn lot vào bin (insert log + update inventory_txn). */
export interface PutawayInput {
  lotSerialId: string;
  itemId: string;
  binId: string;
  qty: number;
  putawayBy?: string | null;
  receiptId?: string | null;
  notes?: string | null;
}

export async function putawayToBin(input: PutawayInput) {
  return db.transaction(async (tx) => {
    const [log] = await tx
      .insert(warehousePutaway)
      .values({
        lotSerialId: input.lotSerialId,
        itemId: input.itemId,
        binId: input.binId,
        qty: String(input.qty),
        putawayBy: input.putawayBy ?? null,
        receiptId: input.receiptId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return log;
  });
}
