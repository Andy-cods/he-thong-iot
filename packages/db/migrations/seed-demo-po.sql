-- ============================================================================
-- V1.9 Phase 1 — Seed 15 PO + 5 PR demo. SQL thuần (không cần tsx).
-- Idempotent: wipe PO-DEMO-* / PR-DEMO-* + cascade lines/inbound_receipt.
-- ============================================================================
SET search_path TO app, public;

BEGIN;

-- 1. Cleanup
DELETE FROM app.inbound_receipt_line WHERE receipt_id IN (
  SELECT id FROM app.inbound_receipt WHERE po_id IN (
    SELECT id FROM app.purchase_order WHERE po_no LIKE 'PO-DEMO-%'
  )
);
DELETE FROM app.inbound_receipt WHERE po_id IN (
  SELECT id FROM app.purchase_order WHERE po_no LIKE 'PO-DEMO-%'
);
DELETE FROM app.purchase_order WHERE po_no LIKE 'PO-DEMO-%';
DELETE FROM app.purchase_request WHERE code LIKE 'PR-DEMO-%';

-- 2. Helper CTE: random supplier + items
WITH suppliers AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM app.supplier WHERE is_active = TRUE LIMIT 5
),
items AS (
  SELECT id, sku, ROW_NUMBER() OVER (ORDER BY sku) AS rn FROM app.item WHERE is_active = TRUE LIMIT 30
),
sup_count AS (SELECT COUNT(*) AS c FROM suppliers),
itm_count AS (SELECT COUNT(*) AS c FROM items),
admin_user AS (SELECT id FROM app.user_account WHERE username = 'admin' LIMIT 1),

-- 3. Insert 5 PR
inserted_prs AS (
  INSERT INTO app.purchase_request (id, code, status, source, requested_by, notes, created_at)
  SELECT
    gen_random_uuid(),
    'PR-DEMO-' || LPAD(g::text, 3, '0'),
    (ARRAY['DRAFT','DRAFT','SUBMITTED','SUBMITTED','CONVERTED'])[g]::app.purchase_request_status,
    'MANUAL',
    (SELECT id FROM admin_user),
    (ARRAY[
      'Yêu cầu mua nguyên liệu thép tấm cho lô SX tuần này',
      'Đề xuất bổ sung dao phay D8 và mũi khoan D5',
      'Mua dầu cắt gọt 200L cho xưởng',
      'Gấp: cần thay bạc đạn 6203 cho máy CNC #2',
      'Đặt hàng theo kế hoạch quý — vật tư tiêu hao'
    ])[g],
    NOW() - (g * INTERVAL '3 days')
  FROM generate_series(1, 5) g
  RETURNING id, code
),

-- 4. Insert 15 PO
inserted_pos AS (
  INSERT INTO app.purchase_order (
    id, po_no, supplier_id, status, order_date, expected_eta,
    total_amount, notes, sent_at, created_at, created_by, payment_terms, delivery_address, metadata
  )
  SELECT
    gen_random_uuid(),
    'PO-DEMO-' || LPAD(g::text, 3, '0'),
    (SELECT id FROM suppliers WHERE rn = ((g - 1) % (SELECT c FROM sup_count)) + 1),
    (ARRAY[
      'DRAFT','DRAFT','DRAFT',                                              -- 3 DRAFT
      'SENT','SENT','SENT','SENT','SENT',                                   -- 5 SENT
      'PARTIAL','PARTIAL','PARTIAL','PARTIAL',                              -- 4 PARTIAL
      'RECEIVED','RECEIVED',                                                -- 2 RECEIVED
      'CANCELLED'                                                           -- 1 CANCELLED
    ])[g]::purchase_order_status,
    (CURRENT_DATE - (g * INTERVAL '2 days'))::date,
    CASE
      WHEN g IN (13,14) THEN (CURRENT_DATE - INTERVAL '5 days')::date
      WHEN g = 15 THEN NULL
      ELSE (CURRENT_DATE + ((g % 14 + 7) * INTERVAL '1 day'))::date
    END,
    0,                                                                      -- total_amount sẽ update sau
    (ARRAY[
      'Đơn hàng theo kế hoạch tuần','Gấp cho WO khẩn','Bổ sung dao cụ',
      'Vật tư tiêu hao tháng','Thép phôi cho dự án Z0000002','Đặt định kỳ',
      'NCC giao tận xưởng','Thanh toán Net 30','COD giao kho','Thử nghiệm chất lượng',
      'Phụ tùng máy CNC','Hóa chất xử lý','Đơn đã hoàn tất','Đơn cuối quý','Đã hủy do NCC hết hàng'
    ])[g],
    CASE WHEN g >= 4 AND g <= 14 THEN NOW() - ((g - 3) * INTERVAL '1 day') ELSE NULL END,
    NOW() - (g * INTERVAL '2 days'),
    (SELECT id FROM admin_user),
    (ARRAY['Net 30','Net 30','Net 15','COD','Net 45'])[((g - 1) % 5) + 1],
    'Xưởng Song Châu — KCN Đại Đồng, Tiên Du, Bắc Ninh',
    CASE
      WHEN g IN (4,5,6,7,8,9,10,11,12,13,14) THEN
        jsonb_build_object('approvalStatus', 'approved', 'approvedAt', NOW() - INTERVAL '1 day')
      ELSE '{}'::jsonb
    END
  FROM generate_series(1, 15) g
  RETURNING id, po_no
),

-- 5. Insert PO lines (3 lines mỗi PO bằng cross-join với items)
po_lines AS (
  INSERT INTO app.purchase_order_line (po_id, line_no, item_id, ordered_qty, received_qty, unit_price, tax_rate, line_total, expected_eta)
  SELECT
    p.id,
    line_no::int,
    (SELECT id FROM items WHERE rn = (((p.po_no_seq - 1) * 3 + line_no - 1) % (SELECT c FROM itm_count)) + 1),
    qty,
    CASE
      WHEN p.po_no LIKE 'PO-DEMO-009' OR p.po_no LIKE 'PO-DEMO-010' OR p.po_no LIKE 'PO-DEMO-011' OR p.po_no LIKE 'PO-DEMO-012'
        THEN ROUND(qty * (0.4 + (line_no * 0.1))::numeric, 2)
      WHEN p.po_no LIKE 'PO-DEMO-013' OR p.po_no LIKE 'PO-DEMO-014'
        THEN qty
      ELSE 0
    END AS recv,
    qty * price,
    8.0,
    qty * price * 1.08,
    NULL
  FROM (
    SELECT id, po_no, ROW_NUMBER() OVER (ORDER BY po_no) AS po_no_seq FROM inserted_pos
  ) p
  CROSS JOIN LATERAL (VALUES
    (1, 50.0, 125000.0),
    (2, 20.0, 480000.0),
    (3, 100.0, 35000.0)
  ) AS t(line_no, qty, price)
  RETURNING po_id, line_total
)

-- 6. Update PO total_amount = SUM(line_total)
UPDATE app.purchase_order po
SET total_amount = (
  SELECT COALESCE(SUM(line_total), 0) FROM app.purchase_order_line WHERE po_id = po.id
)
WHERE po.po_no LIKE 'PO-DEMO-%';

-- 7. Link 1 PR CONVERTED với 1 PO SENT
UPDATE app.purchase_order
SET pr_id = (SELECT id FROM app.purchase_request WHERE code = 'PR-DEMO-005')
WHERE po_no = 'PO-DEMO-004';

-- 8. Verify
SELECT 'PO seeded' AS info, COUNT(*) FROM app.purchase_order WHERE po_no LIKE 'PO-DEMO-%';
SELECT 'PR seeded' AS info, COUNT(*) FROM app.purchase_request WHERE code LIKE 'PR-DEMO-%';
SELECT status, COUNT(*) FROM app.purchase_order WHERE po_no LIKE 'PO-DEMO-%' GROUP BY status ORDER BY status;

COMMIT;
