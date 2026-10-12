-- =============================================================
-- 0081_pr_legacy_buy_backfill.sql
-- Giám thị lần 8 — Đề xuất vật tư (PR). IDEMPOTENT (chạy lại không đổi gì thêm). Áp STAGING trước.
--
-- (1) N3 — cột `approved_qty_prev`: SL cần mua ĐÃ DUYỆT CUỐI trước lần "Kiểm tồn lại" làm tăng mua.
--     Duyệt cuối từ chối phần mua thêm → khôi phục approved_qty = approved_qty_prev.
--
-- (2) N4 — SL dòng PR đang mở làm tròn 4 số lẻ (khớp PO / nhận / xuất kho = numeric(…,4)).
--     qty không bao giờ về 0 (tối thiểu 0,0001).
--
-- (3) N1 — chốt approved_qty cho dòng PHIẾU CŨ (approved_qty NULL) của phiếu đang mở đã qua Kho
--     (approval_step ∉ SUBMITTED/DRAFT/DONE/REJECTED/CANCELLED, chưa hoàn tất/xuất xong), đúng ngữ nghĩa
--     phiếu cũ đang áp dụng:
--       - phiếu có PO không huỷ: approved = phần "đặt hiệu lực" của vật tư phân lần lượt cho các dòng
--         cùng vật tư (thứ tự dòng), mỗi dòng tối đa (qty − SL đã xuất TRƯỚC khi lập PO đầu tiên của
--         phiếu — phần đó chắc chắn lấy từ tồn).
--         Đặt hiệu lực = PO đang mở: max(đặt, đạt + chờ QC); PO đã đóng/nhận đủ: đạt + chờ QC
--         (hàng QC không đạt không tính) — cùng định nghĩa orderedEffective của sổ.
--       - phiếu không có PO: approved = 0 (xuất từ tồn).
--       - dòng nhập tay (chưa có vật tư): approved = qty (chỉ mua được).
--     Sau bước này không còn dòng NULL ở phiếu đang mở → sổ không còn phải suy "đã xuất từ tồn" từ
--     (đã xuất − đã về) theo thời điểm (nguyên nhân N1).
--
-- ── XEM TRƯỚC (chạy riêng, chỉ SELECT) ───────────────────────────────────────
-- WITH tgt AS (
--   SELECT l.id, l.pr_id, l.item_id, l.line_no, l.qty, pr.paper_form_no, pr.status, pr.approval_step,
--          EXISTS (SELECT 1 FROM app.purchase_order po WHERE po.pr_id = l.pr_id AND po.status <> 'CANCELLED') AS has_po
--   FROM app.purchase_request_line l JOIN app.purchase_request pr ON pr.id = l.pr_id
--   WHERE l.approved_qty IS NULL AND pr.completed_at IS NULL AND pr.goods_issued_at IS NULL
--     AND pr.status IN ('SUBMITTED','APPROVED','CONVERTED')
--     AND COALESCE(pr.approval_step::text,'') NOT IN ('SUBMITTED','DRAFT','DONE','REJECTED','CANCELLED','')
-- )
-- SELECT status, approval_step, has_po, item_id IS NULL AS nhap_tay, count(*) AS so_dong, count(DISTINCT pr_id) AS so_phieu
-- FROM tgt GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
-- ==============================================================================

ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS approved_qty_prev numeric(18, 6);

-- (2) làm tròn 4 số lẻ — dòng của phiếu chưa hoàn tất / huỷ / từ chối.
UPDATE app.purchase_request_line l
SET qty = GREATEST(ROUND(l.qty, 4), 0.0001)
FROM app.purchase_request pr
WHERE pr.id = l.pr_id
  AND pr.completed_at IS NULL
  AND pr.status NOT IN ('REJECTED', 'CANCELLED')
  AND l.qty <> GREATEST(ROUND(l.qty, 4), 0.0001);

UPDATE app.purchase_request_line l
SET approved_qty = LEAST(ROUND(l.approved_qty, 4), l.qty)
FROM app.purchase_request pr
WHERE pr.id = l.pr_id
  AND pr.completed_at IS NULL
  AND pr.status NOT IN ('REJECTED', 'CANCELLED')
  AND l.approved_qty IS NOT NULL
  AND l.approved_qty <> LEAST(ROUND(l.approved_qty, 4), l.qty);

-- (3) chốt approved_qty cho dòng phiếu cũ đang mở.
WITH tgt AS (
  SELECT l.id, l.pr_id, l.item_id, l.line_no, l.qty
  FROM app.purchase_request_line l
  JOIN app.purchase_request pr ON pr.id = l.pr_id
  WHERE l.approved_qty IS NULL
    AND pr.completed_at IS NULL
    AND pr.goods_issued_at IS NULL
    AND pr.status IN ('SUBMITTED', 'APPROVED', 'CONVERTED')
    AND COALESCE(pr.approval_step::text, '') NOT IN ('SUBMITTED', 'DRAFT', 'DONE', 'REJECTED', 'CANCELLED', '')
),
first_po AS (
  SELECT po.pr_id, MIN(po.created_at) AS at
  FROM app.purchase_order po
  WHERE po.status <> 'CANCELLED' AND po.pr_id IN (SELECT pr_id FROM tgt)
  GROUP BY po.pr_id
),
eff AS (
  SELECT po.pr_id, pol.item_id,
         SUM(
           CASE WHEN po.status IN ('CLOSED', 'RECEIVED')
                THEN GREATEST(0, pol.received_qty - COALESCE(f.fail, 0))
                ELSE GREATEST(pol.ordered_qty, GREATEST(0, pol.received_qty - COALESCE(f.fail, 0)))
           END
         ) AS oe
  FROM app.purchase_order_line pol
  JOIN app.purchase_order po ON po.id = pol.po_id
  LEFT JOIN LATERAL (
    SELECT SUM(rl.received_qty) AS fail
    FROM app.inbound_receipt_line rl
    WHERE rl.po_line_id = pol.id AND rl.qc_status = 'FAIL'
  ) f ON true
  WHERE po.status <> 'CANCELLED' AND po.pr_id IN (SELECT pr_id FROM tgt)
  GROUP BY po.pr_id, pol.item_id
),
pre AS (
  -- SL đã xuất cho dòng TRƯỚC khi phiếu có PO đầu tiên (chắc chắn lấy từ tồn).
  SELECT gil.purchase_request_line_id AS line_id, SUM(gil.qty) AS q
  FROM app.goods_issue_line gil
  JOIN app.goods_issue gi ON gi.id = gil.goods_issue_id
  JOIN tgt t ON t.id = gil.purchase_request_line_id
  JOIN first_po fp ON fp.pr_id = t.pr_id
  WHERE gi.created_at < fp.at
  GROUP BY gil.purchase_request_line_id
),
calc AS (
  SELECT t.id, t.item_id, t.qty,
         (fp.pr_id IS NOT NULL) AS has_po,
         GREATEST(0, t.qty - COALESCE(pre.q, 0)) AS room,
         COALESCE(e.oe, 0) AS oe,
         COALESCE(SUM(GREATEST(0, t.qty - COALESCE(pre.q, 0))) OVER (
           PARTITION BY t.pr_id, t.item_id ORDER BY t.line_no, t.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS room_before
  FROM tgt t
  LEFT JOIN first_po fp ON fp.pr_id = t.pr_id
  LEFT JOIN eff e ON e.pr_id = t.pr_id AND e.item_id = t.item_id
  LEFT JOIN pre ON pre.line_id = t.id
)
UPDATE app.purchase_request_line l
SET approved_qty = ROUND(
  CASE
    WHEN c.item_id IS NULL THEN c.qty
    WHEN NOT c.has_po THEN 0
    ELSE LEAST(c.room, GREATEST(0, c.oe - c.room_before))
  END, 4)
FROM calc c
WHERE l.id = c.id AND l.approved_qty IS NULL;
