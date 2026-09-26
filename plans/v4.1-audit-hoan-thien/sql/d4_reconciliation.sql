-- ════════════════════════════════════════════════════════════════════
-- V4.1 Đợt 1c — D4 "Đối soát trước kiểm kê" (CHỈ ĐỌC)
--
-- Quyết định D4 (anh Thang): kiểm kê thực tế rồi mới điều chỉnh tồn —
-- TUYỆT ĐỐI KHÔNG tự trừ tồn lịch sử. Script này chỉ LIỆT KÊ chỗ lệch để
-- Kho đối chiếu khi kiểm kê. Không có INSERT/UPDATE/DELETE.
--
-- Hai nguồn lệch đã biết (AUDIT.md §1/§2):
--   A. KHO-04 — phiếu yêu cầu vật tư DELIVERED trước Đợt 1b chỉ đổi trạng
--      thái, KHÔNG trừ tồn, KHÔNG phiếu xuất → tồn hệ thống CAO hơn thực tế
--      đúng bằng SL đã giao. (UI cũ không gửi SL → delivered_qty thường = 0,
--      nên SL ước tính = delivered_qty nếu > 0, ngược lại = requested_qty.)
--   B. KHO-02 — txn xuất (chủ yếu ASSEMBLY_CONSUME) KHÔNG có from_bin_id →
--      tồn theo lô đã trừ nhưng tồn theo BIN (app.bin_inventory) KHÔNG trừ →
--      hàng đã dùng vẫn "trên kệ".
--
-- Cùng logic với API GET /api/warehouse/reports/reconciliation
-- (apps/web/src/server/repos/stockReports.ts) — sửa 1 chỗ thì sửa cả 2.
--
-- Chạy:
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -f /tmp/d4_reconciliation.sql
-- ════════════════════════════════════════════════════════════════════

SET search_path TO app, public;

-- ── A1. Chi tiết: dòng phiếu yêu cầu DELIVERED không có phiếu xuất ─────
SELECT mr.request_no,
       (mr.delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS ngay_giao,
       COALESCE(u.full_name, u.username)                      AS nguoi_yeu_cau,
       i.sku, i.name, i.uom,
       mrl.requested_qty,
       mrl.delivered_qty,
       CASE WHEN mrl.delivered_qty > 0 THEN mrl.delivered_qty
            ELSE mrl.requested_qty END                         AS sl_uoc_tinh_da_giao
FROM app.material_request mr
JOIN app.material_request_line mrl ON mrl.request_id = mr.id
JOIN app.item i ON i.id = mrl.item_id
LEFT JOIN app.user_account u ON u.id = mr.requested_by
WHERE mr.status = 'DELIVERED'
  AND NOT EXISTS (SELECT 1 FROM app.goods_issue gi WHERE gi.material_request_id = mr.id)
ORDER BY mr.delivered_at NULLS LAST, mr.request_no, mrl.line_no;

-- ── A2. Tổng theo mã hàng + tồn hệ thống hiện tại ─────────────────────
SELECT i.sku, i.name, i.uom,
       COUNT(DISTINCT mr.id)                                   AS so_phieu,
       SUM(CASE WHEN mrl.delivered_qty > 0 THEN mrl.delivered_qty
                ELSE mrl.requested_qty END)                    AS sl_da_giao_chua_tru,
       COALESCE(vs.on_hand_total, 0)                           AS ton_he_thong,
       COALESCE(vs.on_hand_total, 0)
         - SUM(CASE WHEN mrl.delivered_qty > 0 THEN mrl.delivered_qty
                    ELSE mrl.requested_qty END)                AS ton_uoc_tinh_sau_tru
FROM app.material_request mr
JOIN app.material_request_line mrl ON mrl.request_id = mr.id
JOIN app.item i ON i.id = mrl.item_id
LEFT JOIN app.v_item_stock vs ON vs.item_id = mrl.item_id
WHERE mr.status = 'DELIVERED'
  AND NOT EXISTS (SELECT 1 FROM app.goods_issue gi WHERE gi.material_request_id = mr.id)
GROUP BY i.id, i.sku, i.name, i.uom, vs.on_hand_total
ORDER BY sl_da_giao_chua_tru DESC, i.sku;

-- ── B1. Chi tiết: txn xuất không có bin (bin_inventory không trừ) ─────
SELECT t.id AS txn_id,
       (t.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS thoi_diem,
       t.tx_type, i.sku, i.name, i.uom,
       l.lot_code, t.qty, t.ref_table, w.wo_no, t.notes
FROM app.inventory_txn t
JOIN app.item i ON i.id = t.item_id
LEFT JOIN app.inventory_lot_serial l ON l.id = t.lot_serial_id
LEFT JOIN app.assembly_scan s ON t.ref_table = 'assembly_scan' AND s.id = t.ref_id
LEFT JOIN app.work_order w ON w.id = s.wo_id
WHERE t.tx_type IN ('ASSEMBLY_CONSUME','OUT_ISSUE','ADJUST_MINUS')
  AND t.from_bin_id IS NULL
ORDER BY t.occurred_at;

-- ── B2. Tổng theo mã hàng (SL bin đang "thừa" so với tồn theo lô) ──────
SELECT i.sku, i.name, i.uom,
       COUNT(*)      AS so_giao_dich,
       SUM(t.qty)    AS sl_chua_tru_khoi_bin
FROM app.inventory_txn t
JOIN app.item i ON i.id = t.item_id
WHERE t.tx_type IN ('ASSEMBLY_CONSUME','OUT_ISSUE','ADJUST_MINUS')
  AND t.from_bin_id IS NULL
GROUP BY i.id, i.sku, i.name, i.uom
ORDER BY sl_chua_tru_khoi_bin DESC, i.sku;
