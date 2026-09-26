/**
 * V4.1 Đợt 1c — D4 "Đối soát trước kiểm kê" (CHỈ ĐỌC).
 *
 * Quyết định D4: kiểm kê thực tế rồi điều chỉnh — TUYỆT ĐỐI KHÔNG tự trừ tồn
 * lịch sử. File này chỉ liệt kê 2 nguồn lệch đã biết để Kho đối chiếu:
 *
 *  A. KHO-04 — phiếu yêu cầu vật tư DELIVERED trước Đợt 1b (không phiếu xuất,
 *     không trừ tồn) → tồn hệ thống cao hơn thực tế. UI cũ không gửi SL nên
 *     `delivered_qty` thường = 0 → SL ước tính = delivered_qty nếu > 0, ngược
 *     lại = requested_qty.
 *  B. KHO-02 — txn xuất KHÔNG có `from_bin_id` (chủ yếu ASSEMBLY_CONSUME trước
 *     1a) → tồn theo lô đã trừ nhưng tồn theo bin chưa trừ.
 *
 * SQL gốc (chạy tay khi cần): plans/v4.1-audit-hoan-thien/sql/d4_reconciliation.sql
 * — giữ 2 nơi CÙNG logic.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Giới hạn số dòng chi tiết trả về (báo cáo đọc trên web; CSV đủ dùng). */
const DETAIL_LIMIT = 2000;

export interface MrDeliveredWithoutIssueRow {
  requestId: string;
  requestNo: string;
  deliveredAt: string | null;
  requestedByName: string | null;
  lineNo: number;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string | null;
  requestedQty: number;
  deliveredQty: number;
  /** SL ước tính đã giao (chưa trừ tồn). */
  assumedQty: number;
}

export interface MrDeliveredSkuSummary {
  itemId: string;
  sku: string;
  itemName: string;
  uom: string | null;
  requestCount: number;
  assumedQty: number;
  /** Tồn hệ thống hiện tại (app.v_item_stock.on_hand_total). */
  onHandTotal: number;
  /** Tồn ước tính nếu trừ phần đã giao (chỉ tham khảo khi kiểm kê). */
  onHandAfter: number;
}

export interface OutboundWithoutBinRow {
  txnId: string;
  occurredAt: string;
  txType: string;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string | null;
  lotCode: string | null;
  qty: number;
  refTable: string | null;
  woNo: string | null;
  notes: string | null;
}

export interface OutboundWithoutBinSkuSummary {
  itemId: string;
  sku: string;
  itemName: string;
  uom: string | null;
  txnCount: number;
  qty: number;
}

const MR_LEGACY_WHERE = sql`
  mr.status = 'DELIVERED'
  AND NOT EXISTS (SELECT 1 FROM app.goods_issue gi WHERE gi.material_request_id = mr.id)
`;

const ASSUMED_QTY = sql`CASE WHEN mrl.delivered_qty > 0 THEN mrl.delivered_qty ELSE mrl.requested_qty END`;

/** A — phiếu yêu cầu DELIVERED không có phiếu xuất (chi tiết + tổng theo mã). */
export async function listMrDeliveredWithoutIssue(): Promise<{
  rows: MrDeliveredWithoutIssueRow[];
  bySku: MrDeliveredSkuSummary[];
  truncated: boolean;
}> {
  const [detail, summary] = await Promise.all([
    db.execute(sql`
      SELECT mr.id::text AS request_id, mr.request_no,
             mr.delivered_at::text AS delivered_at,
             COALESCE(u.full_name, u.username) AS requested_by_name,
             mrl.line_no, i.id::text AS item_id, i.sku, i.name AS item_name, i.uom,
             mrl.requested_qty::text AS requested_qty,
             mrl.delivered_qty::text AS delivered_qty,
             (${ASSUMED_QTY})::text AS assumed_qty
      FROM app.material_request mr
      JOIN app.material_request_line mrl ON mrl.request_id = mr.id
      JOIN app.item i ON i.id = mrl.item_id
      LEFT JOIN app.user_account u ON u.id = mr.requested_by
      WHERE ${MR_LEGACY_WHERE}
      ORDER BY mr.delivered_at NULLS LAST, mr.request_no, mrl.line_no
      LIMIT ${DETAIL_LIMIT + 1}
    `),
    db.execute(sql`
      SELECT i.id::text AS item_id, i.sku, i.name AS item_name, i.uom,
             COUNT(DISTINCT mr.id)::int AS request_count,
             SUM(${ASSUMED_QTY})::text AS assumed_qty,
             COALESCE(vs.on_hand_total, 0)::text AS on_hand_total
      FROM app.material_request mr
      JOIN app.material_request_line mrl ON mrl.request_id = mr.id
      JOIN app.item i ON i.id = mrl.item_id
      LEFT JOIN app.v_item_stock vs ON vs.item_id = mrl.item_id
      WHERE ${MR_LEGACY_WHERE}
      GROUP BY i.id, i.sku, i.name, i.uom, vs.on_hand_total
      ORDER BY SUM(${ASSUMED_QTY}) DESC, i.sku
    `),
  ]);

  const detailRows = detail as unknown as Array<Record<string, string | number | null>>;
  const rows: MrDeliveredWithoutIssueRow[] = detailRows.slice(0, DETAIL_LIMIT).map((r) => ({
    requestId: String(r.request_id),
    requestNo: String(r.request_no),
    deliveredAt: (r.delivered_at as string | null) ?? null,
    requestedByName: (r.requested_by_name as string | null) ?? null,
    lineNo: Number(r.line_no),
    itemId: String(r.item_id),
    sku: String(r.sku),
    itemName: String(r.item_name),
    uom: (r.uom as string | null) ?? null,
    requestedQty: Number(r.requested_qty) || 0,
    deliveredQty: Number(r.delivered_qty) || 0,
    assumedQty: Number(r.assumed_qty) || 0,
  }));

  const bySku: MrDeliveredSkuSummary[] = (
    summary as unknown as Array<Record<string, string | number | null>>
  ).map((r) => {
    const assumed = Number(r.assumed_qty) || 0;
    const onHand = Number(r.on_hand_total) || 0;
    return {
      itemId: String(r.item_id),
      sku: String(r.sku),
      itemName: String(r.item_name),
      uom: (r.uom as string | null) ?? null,
      requestCount: Number(r.request_count) || 0,
      assumedQty: assumed,
      onHandTotal: onHand,
      onHandAfter: Math.round((onHand - assumed) * 10_000) / 10_000,
    };
  });

  return { rows, bySku, truncated: detailRows.length > DETAIL_LIMIT };
}

const NO_BIN_WHERE = sql`
  t.tx_type IN ('ASSEMBLY_CONSUME', 'OUT_ISSUE', 'ADJUST_MINUS')
  AND t.from_bin_id IS NULL
`;

/**
 * B — txn xuất không có bin (chủ yếu ASSEMBLY_CONSUME trước Đợt 1a). Gồm cả
 * OUT_ISSUE/ADJUST_MINUS không bin (cùng phạm vi CHECK
 * `inventory_txn_out_requires_bin` của 0060).
 */
export async function listAssemblyConsumeWithoutBin(): Promise<{
  rows: OutboundWithoutBinRow[];
  bySku: OutboundWithoutBinSkuSummary[];
  truncated: boolean;
}> {
  const [detail, summary] = await Promise.all([
    db.execute(sql`
      SELECT t.id::text AS txn_id, t.occurred_at::text AS occurred_at,
             t.tx_type::text AS tx_type, i.id::text AS item_id, i.sku,
             i.name AS item_name, i.uom, l.lot_code, t.qty::text AS qty,
             t.ref_table, w.wo_no, t.notes
      FROM app.inventory_txn t
      JOIN app.item i ON i.id = t.item_id
      LEFT JOIN app.inventory_lot_serial l ON l.id = t.lot_serial_id
      LEFT JOIN app.assembly_scan s ON t.ref_table = 'assembly_scan' AND s.id = t.ref_id
      LEFT JOIN app.work_order w ON w.id = s.wo_id
      WHERE ${NO_BIN_WHERE}
      ORDER BY t.occurred_at
      LIMIT ${DETAIL_LIMIT + 1}
    `),
    db.execute(sql`
      SELECT i.id::text AS item_id, i.sku, i.name AS item_name, i.uom,
             COUNT(*)::int AS txn_count, SUM(t.qty)::text AS qty
      FROM app.inventory_txn t
      JOIN app.item i ON i.id = t.item_id
      WHERE ${NO_BIN_WHERE}
      GROUP BY i.id, i.sku, i.name, i.uom
      ORDER BY SUM(t.qty) DESC, i.sku
    `),
  ]);

  const detailRows = detail as unknown as Array<Record<string, string | number | null>>;
  const rows: OutboundWithoutBinRow[] = detailRows.slice(0, DETAIL_LIMIT).map((r) => ({
    txnId: String(r.txn_id),
    occurredAt: String(r.occurred_at),
    txType: String(r.tx_type),
    itemId: String(r.item_id),
    sku: String(r.sku),
    itemName: String(r.item_name),
    uom: (r.uom as string | null) ?? null,
    lotCode: (r.lot_code as string | null) ?? null,
    qty: Number(r.qty) || 0,
    refTable: (r.ref_table as string | null) ?? null,
    woNo: (r.wo_no as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));

  const bySku: OutboundWithoutBinSkuSummary[] = (
    summary as unknown as Array<Record<string, string | number | null>>
  ).map((r) => ({
    itemId: String(r.item_id),
    sku: String(r.sku),
    itemName: String(r.item_name),
    uom: (r.uom as string | null) ?? null,
    txnCount: Number(r.txn_count) || 0,
    qty: Number(r.qty) || 0,
  }));

  return { rows, bySku, truncated: detailRows.length > DETAIL_LIMIT };
}
