-- =============================================================
-- 0081_pr_legacy_buy_backfill.sql   (viết lại theo giám thị lần 9 — CHƯA chạy prod)
-- Đề xuất vật tư (PR). Một transaction. IDEMPOTENT. Áp STAGING / bản sao prod trước.
--
-- (1) N3 — cột `approved_qty_prev` (SL cần mua đã duyệt cuối trước Kiểm tồn lại tăng mua).
-- (2) N4 — SL dòng PR đang mở làm tròn 4 số lẻ (qty tối thiểu 0,0001; approved ≤ qty).
-- (3) N1 — chốt approved_qty cho dòng PHIẾU CŨ (approved_qty NULL) của phiếu đang mở đã qua Kho
--     (approval_step ∉ SUBMITTED/DRAFT/DONE/REJECTED/CANCELLED; chưa hoàn tất / xuất xong):
--     M1 — phiếu CÓ PO (không huỷ): approved = Σ SL ĐẶT của mọi PO không huỷ của vật tư (kể cả PO đã
--          đóng / hàng QC hỏng), rót lần lượt theo dòng, mỗi dòng ≤ room = qty − SL đã xuất TRƯỚC PO
--          đầu tiên. Phần hỏng / giao thiếu thành "còn phải đặt" (toOrder) như phiếu mới → endpoint
--          POST /api/admin/pr/backfill-topup-notify báo Thu mua.
--     M2 — phiếu KHÔNG PO: phân TỒN KHẢ DỤNG hiện tại của vật tư (issuable − giữ chỗ của các phiếu đã có
--          approved, gồm cả dòng vừa chốt ở M1) cho các dòng phiếu cũ theo thứ tự phiếu tạo trước
--          (created_at, line_no): give = min(qty − đã xuất, phần tồn còn lại);
--          approved = qty − đã xuất − give (≥ 0) → phần thiếu thành cần mua. Giữ chỗ mới = give ≤ tồn.
--     Dòng nhập tay (chưa có vật tư) → approved = qty.
--     Phân bổ M2 viết bằng CTE + window function (Σ nhu cầu các dòng trước theo vật tư) — tương đương
--     vòng lặp "dòng trước dùng trước", không cần PL/pgSQL; hàm thuần `legacyStockAllocation`
--     (apps/web/src/lib/pr-ledger.ts) cài cùng thuật toán và có vitest.
--     Mọi dòng bị đổi ghi vào app.pr_line_backfill_0081 (bảng audit).
--
-- ── XEM TRƯỚC: chạy file với COMMIT đổi thành ROLLBACK, đọc bảng kết quả "XEM TRƯỚC 0081" in ra:
--   sed 's/^COMMIT;/ROLLBACK;/' 0081_pr_legacy_buy_backfill.sql | psql ... -v ON_ERROR_STOP=1
-- =============================================================

BEGIN;

ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS approved_qty_prev numeric(18, 6);

CREATE TABLE IF NOT EXISTS app.pr_line_backfill_0081 (
  pr_line_id   uuid        NOT NULL,
  pr_id        uuid        NOT NULL,
  reason       text        NOT NULL,
  old_qty      numeric(18, 6),
  new_qty      numeric(18, 6),
  old_approved numeric(18, 6),
  new_approved numeric(18, 6),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pr_line_id, reason)
);

-- (2) làm tròn 4 số lẻ — dòng của phiếu chưa hoàn tất / huỷ / từ chối.
WITH chg AS (
  SELECT l.id, l.pr_id, l.qty AS old_qty, GREATEST(ROUND(l.qty, 4), 0.0001) AS new_qty,
         l.approved_qty AS old_appr,
         CASE WHEN l.approved_qty IS NULL THEN NULL
              ELSE LEAST(ROUND(l.approved_qty, 4), GREATEST(ROUND(l.qty, 4), 0.0001)) END AS new_appr
  FROM app.purchase_request_line l
  JOIN app.purchase_request pr ON pr.id = l.pr_id
  WHERE pr.completed_at IS NULL AND pr.status NOT IN ('REJECTED', 'CANCELLED')
),
d AS (
  SELECT * FROM chg
  WHERE old_qty <> new_qty OR (old_appr IS NOT NULL AND old_appr <> new_appr)
),
ins AS (
  INSERT INTO app.pr_line_backfill_0081 (pr_line_id, pr_id, reason, old_qty, new_qty, old_approved, new_approved)
  SELECT id, pr_id, 'round4', old_qty, new_qty, old_appr, new_appr FROM d
  ON CONFLICT DO NOTHING
)
UPDATE app.purchase_request_line l
SET qty = d.new_qty, approved_qty = d.new_appr
FROM d WHERE l.id = d.id;

-- (3) tính kết quả chốt vào bảng tạm (dùng chung cho XEM TRƯỚC + UPDATE).
CREATE TEMP TABLE _bf0081 ON COMMIT DROP AS
WITH tgt AS (
  SELECT l.id, l.pr_id, l.item_id, l.line_no, l.qty, pr.created_at AS pr_created,
         COALESCE((SELECT SUM(gil.qty) FROM app.goods_issue_line gil WHERE gil.purchase_request_line_id = l.id), 0) AS issued,
         EXISTS (SELECT 1 FROM app.purchase_order po WHERE po.pr_id = l.pr_id AND po.status <> 'CANCELLED') AS has_po
  FROM app.purchase_request_line l
  JOIN app.purchase_request pr ON pr.id = l.pr_id
  WHERE l.approved_qty IS NULL
    AND pr.completed_at IS NULL
    AND pr.goods_issued_at IS NULL
    AND pr.status IN ('SUBMITTED', 'APPROVED', 'CONVERTED')
    AND COALESCE(pr.approval_step::text, '') NOT IN ('SUBMITTED', 'DRAFT', 'DONE', 'REJECTED', 'CANCELLED', '')
    AND NOT EXISTS (SELECT 1 FROM app.pr_line_backfill_0081 b WHERE b.pr_line_id = l.id AND b.reason LIKE 'backfill%')
),
first_po AS (
  SELECT po.pr_id, MIN(po.created_at) AS at
  FROM app.purchase_order po
  WHERE po.status <> 'CANCELLED' AND po.pr_id IN (SELECT pr_id FROM tgt)
  GROUP BY po.pr_id
),
ordered AS (
  -- M1: Σ SL ĐẶT của mọi PO không huỷ (kể cả đã đóng / QC hỏng).
  SELECT po.pr_id, pol.item_id, SUM(pol.ordered_qty) AS q
  FROM app.purchase_order_line pol
  JOIN app.purchase_order po ON po.id = pol.po_id
  WHERE po.status <> 'CANCELLED' AND po.pr_id IN (SELECT pr_id FROM tgt)
  GROUP BY po.pr_id, pol.item_id
),
pre AS (
  SELECT gil.purchase_request_line_id AS line_id, SUM(gil.qty) AS q
  FROM app.goods_issue_line gil
  JOIN app.goods_issue gi ON gi.id = gil.goods_issue_id
  JOIN tgt t ON t.id = gil.purchase_request_line_id
  JOIN first_po fp ON fp.pr_id = t.pr_id
  WHERE gi.created_at < fp.at
  GROUP BY gil.purchase_request_line_id
),
m1 AS (
  SELECT t.id,
         LEAST(
           GREATEST(0, t.qty - COALESCE(pre.q, 0)),
           GREATEST(0, COALESCE(o.q, 0) - COALESCE(SUM(GREATEST(0, t.qty - COALESCE(pre.q, 0))) OVER (
             PARTITION BY t.pr_id, t.item_id ORDER BY t.line_no, t.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))
         ) AS appr
  FROM tgt t
  LEFT JOIN pre ON pre.line_id = t.id
  LEFT JOIN ordered o ON o.pr_id = t.pr_id AND o.item_id = t.item_id
  WHERE t.has_po AND t.item_id IS NOT NULL
),
-- Giữ chỗ hiện có theo vật tư (sổ: theo vật tư trong phiếu, cap = min(Σreq, Σfs + đạt) − Σ đã xuất) của
-- mọi phiếu đang giữ chỗ, tính trên dòng ĐÃ có approved + dòng vừa chốt ở M1.
pos_ok AS (
  SELECT po.pr_id, pol.item_id,
         SUM(GREATEST(0, pol.received_qty
             - COALESCE((SELECT SUM(rl.received_qty) FROM app.inbound_receipt_line rl WHERE rl.po_line_id = pol.id AND rl.qc_status IN ('FAIL', 'PENDING')), 0))) AS ok
  FROM app.purchase_order_line pol
  JOIN app.purchase_order po ON po.id = pol.po_id
  WHERE po.status <> 'CANCELLED'
  GROUP BY po.pr_id, pol.item_id
),
holder_lines AS (
  SELECT l.pr_id, l.item_id, l.qty AS req,
         COALESCE(m1.appr, l.approved_qty) AS appr,
         COALESCE((SELECT SUM(gil.qty) FROM app.goods_issue_line gil WHERE gil.purchase_request_line_id = l.id), 0) AS issued
  FROM app.purchase_request_line l
  JOIN app.purchase_request pr ON pr.id = l.pr_id
  LEFT JOIN m1 ON m1.id = l.id
  WHERE l.item_id IS NOT NULL
    AND COALESCE(m1.appr, l.approved_qty) IS NOT NULL
    AND pr.dept_approved_at IS NOT NULL
    AND pr.completed_at IS NULL AND pr.goods_issued_at IS NULL
    AND ((pr.status = 'SUBMITTED' AND pr.approval_step = 'DEPT_APPROVED')
         OR (pr.status IN ('APPROVED', 'CONVERTED') AND COALESCE(pr.approval_step::text, '') NOT IN ('DONE', 'REJECTED', 'CANCELLED')))
),
holds AS (
  SELECT h.item_id,
         SUM(GREATEST(0, LEAST(h.req, h.fs + COALESCE(p.ok, 0)) - h.issued)) AS held
  FROM (
    SELECT pr_id, item_id, SUM(req) AS req, SUM(req - LEAST(appr, req)) AS fs, SUM(issued) AS issued
    FROM holder_lines GROUP BY pr_id, item_id
  ) h
  LEFT JOIN pos_ok p ON p.pr_id = h.pr_id AND p.item_id = h.item_id
  GROUP BY h.item_id
),
m2 AS (
  -- M2: phân tồn khả dụng cho dòng phiếu cũ không PO, phiếu tạo trước dùng trước (theo vật tư).
  SELECT t.id,
         GREATEST(0, t.qty - t.issued) AS need,
         GREATEST(0, COALESCE(v.issuable_qty, 0) - COALESCE(hd.held, 0)) AS pool,
         COALESCE(SUM(GREATEST(0, t.qty - t.issued)) OVER (
           PARTITION BY t.item_id ORDER BY t.pr_created, t.pr_id, t.line_no, t.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS need_before
  FROM tgt t
  LEFT JOIN app.v_item_stock v ON v.item_id = t.item_id
  LEFT JOIN holds hd ON hd.item_id = t.item_id
  WHERE NOT t.has_po AND t.item_id IS NOT NULL
)
SELECT t.id, t.pr_id, t.item_id, t.qty, t.issued, t.has_po,
       CASE
         WHEN t.item_id IS NULL THEN 'backfill_nhap_tay'
         WHEN t.has_po THEN 'backfill_m1_co_po'
         ELSE 'backfill_m2_khong_po'
       END AS reason,
       m2.need, m2.pool,
       CASE WHEN m2.id IS NULL THEN NULL ELSE LEAST(m2.need, GREATEST(0, m2.pool - m2.need_before)) END AS give,
       ROUND(CASE
         WHEN t.item_id IS NULL THEN t.qty
         WHEN t.has_po THEN m1.appr
         ELSE GREATEST(0, t.qty - t.issued - LEAST(m2.need, GREATEST(0, m2.pool - m2.need_before)))
       END, 4) AS new_appr
FROM tgt t
LEFT JOIN m1 ON m1.id = t.id
LEFT JOIN m2 ON m2.id = t.id;

-- XEM TRƯỚC 0081 — từng dòng: phiếu, vật tư, SL, đã xuất, PO đặt/nhận/đạt/hỏng, approved mới,
-- còn phải đặt mới (theo vật tư trong phiếu), giữ chỗ mới (M2 = give) và tồn khả dụng.
SELECT COALESCE(pr.paper_form_no, pr.code) AS phieu, pr.status, b.reason,
       COALESCE(i.sku, '(nhập tay)') AS vat_tu, b.qty, b.issued,
       COALESCE(po.dat, 0) AS po_dat, COALESCE(po.nhan, 0) AS po_nhan, COALESCE(po.dat_qc, 0) AS po_dat_qc, COALESCE(po.hong, 0) AS po_hong,
       b.new_appr AS approved_moi,
       CASE WHEN b.has_po THEN GREATEST(0, SUM(b.new_appr) OVER (PARTITION BY b.pr_id, b.item_id) - COALESCE(po.hieu_luc, 0)) ELSE b.new_appr END AS con_phai_dat_vt,
       b.give AS giu_cho_moi, ROUND(COALESCE(v.issuable_qty, 0), 4) AS ton_kha_dung
FROM _bf0081 b
JOIN app.purchase_request pr ON pr.id = b.pr_id
LEFT JOIN app.item i ON i.id = b.item_id
LEFT JOIN app.v_item_stock v ON v.item_id = b.item_id
LEFT JOIN LATERAL (
  SELECT SUM(pol.ordered_qty) AS dat, SUM(pol.received_qty) AS nhan,
         SUM(GREATEST(0, pol.received_qty - COALESCE(f.fail, 0) - COALESCE(f.pend, 0))) AS dat_qc,
         SUM(COALESCE(f.fail, 0)) AS hong,
         SUM(CASE WHEN po2.status IN ('CLOSED', 'RECEIVED') THEN GREATEST(0, pol.received_qty - COALESCE(f.fail, 0))
                  ELSE GREATEST(pol.ordered_qty, GREATEST(0, pol.received_qty - COALESCE(f.fail, 0))) END) AS hieu_luc
  FROM app.purchase_order_line pol
  JOIN app.purchase_order po2 ON po2.id = pol.po_id
  LEFT JOIN LATERAL (
    SELECT SUM(rl.received_qty) FILTER (WHERE rl.qc_status = 'FAIL') AS fail,
           SUM(rl.received_qty) FILTER (WHERE rl.qc_status = 'PENDING') AS pend
    FROM app.inbound_receipt_line rl WHERE rl.po_line_id = pol.id
  ) f ON true
  WHERE po2.pr_id = b.pr_id AND po2.status <> 'CANCELLED' AND pol.item_id = b.item_id
) po ON true
ORDER BY pr.created_at, phieu, vat_tu;

INSERT INTO app.pr_line_backfill_0081 (pr_line_id, pr_id, reason, old_qty, new_qty, old_approved, new_approved)
SELECT id, pr_id, reason, qty, qty, NULL, new_appr FROM _bf0081
ON CONFLICT DO NOTHING;

UPDATE app.purchase_request_line l
SET approved_qty = b.new_appr
FROM _bf0081 b
WHERE l.id = b.id AND l.approved_qty IS NULL;

COMMIT;
