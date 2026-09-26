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
  /** V4.1 — = issuable_qty của app.v_item_stock (lô AVAILABLE − giữ chỗ). */
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
  issuable: string;
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
  // V3.11.3 (audit 1.1) — bind từng UUID làm parameter thay vì nội suy raw vào
  // SQL (tránh SQL injection). sql.join sinh danh sách `$1::uuid, $2::uuid, ...`.
  const itemIdFilter =
    itemIds && itemIds.length > 0
      ? sql`AND i.id = ANY(ARRAY[${sql.join(
          itemIds.map((x) => sql`${x}::uuid`),
          sql`, `,
        )}])`
      : sql``;

  // hasLotOnly: chỉ trả item nào có ít nhất 1 lot.
  const havingLot = hasLotOnly
    ? sql`AND EXISTS (SELECT 1 FROM app.inventory_lot_serial lz WHERE lz.item_id = i.id)`
    : sql``;

  // V4.1 KHO-16 — dùng view tồn chuẩn app.v_item_stock (migration 0059)
  // thay CTE tự tính (trước đây gom TOÀN BỘ lot rồi mới lọc item).
  //   onHand   = on_hand_available (tồn lô AVAILABLE)
  //   holdQty  = hold_qty          (tồn lô HOLD)
  //   reserved = reserved          (giữ chỗ ACTIVE)
  //   available= issuable_qty      (Khả dụng xuất — không bao giờ tính HOLD)
  const rows = (await db.execute(sql`
    SELECT
      i.id::text       AS item_id,
      i.sku            AS sku,
      i.name           AS name,
      i.uom::text      AS uom,
      i.category       AS category,
      i.min_stock_qty::text AS min_stock_qty,
      COALESCE(v.on_hand_available, 0)::text AS on_hand,
      COALESCE(v.hold_qty, 0)::text          AS hold_qty,
      COALESCE(v.reserved, 0)::text          AS reserved,
      COALESCE(v.issuable_qty, 0)::text      AS issuable
    FROM app.item i
    LEFT JOIN app.v_item_stock v ON v.item_id = i.id
    WHERE i.is_active = true
      ${itemIdFilter}
      ${havingLot}
    ORDER BY i.sku ASC
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
      available: Math.max(0, Number(r.issuable) || 0),
    };
  });

  return { rows: mapped, total };
}
