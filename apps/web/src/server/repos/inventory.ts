/**
 * Inventory balance repo (TASK-20260427-017).
 *
 * Bài toán: "Hàng tồn kho 6, BOM cần 3 chưa SX → chưa trừ on-hand nhưng giữ
 * chỗ (reserved hoặc HOLD QC)". Schema KHÔNG có cột `qty` ở `inventory_lot_serial`
 * — phải compute on-hand từ `inventory_txn` (transaction-first):
 *   on_hand = SUM(qty * direction) by item_id (lọc lot AVAILABLE để gộp tổng available)
 * Reserved tính từ `reservation` status='ACTIVE' join lot → item.
 * Available = on_hand - reserved (clamp ≥ 0).
 *
 * Workaround schema gap: lot_serial không lưu qty → must aggregate `inventory_txn`.
 * Đây là pattern đã dùng ở `repos/items.ts` và `api/lot-serial/route.ts`.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface InventoryBalanceRow {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  category: string | null;
  minStockQty: number;
  /** SUM(IN−OUT) qua tất cả lot AVAILABLE của item. */
  onHand: number;
  /** SUM(reservation.reserved_qty WHERE status='ACTIVE'). */
  reserved: number;
  /** SUM(IN−OUT) qua các lot HOLD (chờ QC). */
  holdQty: number;
  /** = MAX(0, onHand − reserved). */
  available: number;
}

export interface ListInventoryBalanceOpts {
  itemIds?: string[];
  /** Filter chỉ trả các SKU có lot — tránh trả full danh mục SKU chưa từng nhập. */
  hasLotOnly?: boolean;
  page?: number;
  pageSize?: number;
}

interface RawRow {
  item_id: string;
  sku: string;
  name: string;
  uom: string;
  category: string | null;
  min_stock_qty: string;
  on_hand: string;
  reserved: string;
  hold_qty: string;
}

/**
 * Compute inventory balance grouped by item.
 *
 * SQL chiến lược: dùng CTE `lot_qty` aggregate inventory_txn → on-hand
 * mỗi lot (kèm status), rồi outer SUM theo status.
 */
export async function getInventoryBalance(
  opts: ListInventoryBalanceOpts = {},
): Promise<{ rows: InventoryBalanceRow[]; total: number }> {
  const { itemIds, hasLotOnly = true, page = 1, pageSize = 100 } = opts;
  const offset = (page - 1) * pageSize;

  // Filter clauses
  const itemIdFilter =
    itemIds && itemIds.length > 0
      ? sql`AND i.id = ANY(${sql.raw(`ARRAY[${itemIds.map((x) => `'${x}'::uuid`).join(",")}]`)})`
      : sql``;

  // hasLotOnly: chỉ trả item nào có ít nhất 1 lot.
  const havingLot = hasLotOnly
    ? sql`AND EXISTS (SELECT 1 FROM app.inventory_lot_serial lz WHERE lz.item_id = i.id)`
    : sql``;

  // SQL: aggregate per lot bằng inventory_txn, sau đó group by item.
  // Dùng raw SQL vì phức tạp + có CTE; reuse pattern từ items.ts.
  const rows = (await db.execute(sql`
    WITH lot_balance AS (
      SELECT
        l.id            AS lot_id,
        l.item_id       AS item_id,
        l.status        AS lot_status,
        COALESCE(SUM(
          CASE
            WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
            WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
            ELSE 0
          END
        ), 0) AS qty
      FROM app.inventory_lot_serial l
      LEFT JOIN app.inventory_txn t ON t.lot_serial_id = l.id
      GROUP BY l.id, l.item_id, l.status
    ),
    item_agg AS (
      SELECT
        i.id::text       AS item_id,
        i.sku            AS sku,
        i.name           AS name,
        i.uom::text      AS uom,
        i.category       AS category,
        i.min_stock_qty::text AS min_stock_qty,
        COALESCE(SUM(CASE WHEN lb.lot_status = 'AVAILABLE' THEN lb.qty ELSE 0 END), 0)::text AS on_hand,
        COALESCE(SUM(CASE WHEN lb.lot_status = 'HOLD'      THEN lb.qty ELSE 0 END), 0)::text AS hold_qty,
        COALESCE((
          SELECT SUM(r.reserved_qty)
          FROM app.reservation r
          JOIN app.inventory_lot_serial ll ON ll.id = r.lot_serial_id
          WHERE ll.item_id = i.id AND r.status = 'ACTIVE'
        ), 0)::text AS reserved
      FROM app.item i
      LEFT JOIN lot_balance lb ON lb.item_id = i.id
      WHERE i.is_active = true
        ${itemIdFilter}
        ${havingLot}
      GROUP BY i.id, i.sku, i.name, i.uom, i.category, i.min_stock_qty
    )
    SELECT * FROM item_agg
    ORDER BY sku ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `)) as unknown as RawRow[];

  // Count total — chạy riêng cho meta. Cùng filter.
  const countRows = (await db.execute(sql`
    SELECT COUNT(*)::int AS total FROM app.item i
    WHERE i.is_active = true
      ${itemIdFilter}
      ${havingLot}
  `)) as unknown as Array<{ total: number }>;

  const total = countRows[0]?.total ?? 0;

  const mapped: InventoryBalanceRow[] = rows.map((r) => {
    const onHand = Number(r.on_hand) || 0;
    const reserved = Number(r.reserved) || 0;
    const holdQty = Number(r.hold_qty) || 0;
    return {
      itemId: r.item_id,
      sku: r.sku,
      name: r.name,
      uom: r.uom,
      category: r.category,
      minStockQty: Number(r.min_stock_qty) || 0,
      onHand,
      reserved,
      holdQty,
      available: Math.max(0, onHand - reserved),
    };
  });

  return { rows: mapped, total };
}
