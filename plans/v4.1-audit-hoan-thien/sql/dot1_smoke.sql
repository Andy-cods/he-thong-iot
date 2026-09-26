-- ════════════════════════════════════════════════════════════════════
-- V4.1 Đợt 1a — SMOKE TEST TAY cho migration 0059_qc_hold.sql
--   (trigger inventory_txn_lot_guard + view v_lot_stock / v_item_stock)
--
-- Chạy SAU khi apply 0059, trên DB staging/local (hoặc prod trong cửa sổ bảo
-- trì — script tự ROLLBACK, KHÔNG để lại dữ liệu):
--
--   docker cp plans/v4.1-audit-hoan-thien/sql/dot1_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/dot1_smoke.sql
--
-- Kết quả mong đợi: mọi dòng "PASS"/NOTICE "OK", cuối cùng ROLLBACK.
-- Bất kỳ RAISE EXCEPTION 'SMOKE FAIL …' nào = migration sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

-- ── 0. Đối tượng tồn tại ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='inventory_lot_serial' AND column_name='hold_code') THEN
    RAISE EXCEPTION 'SMOKE FAIL: thiếu cột inventory_lot_serial.hold_code';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='inbound_receipt_line' AND column_name='lot_serial_id') THEN
    RAISE EXCEPTION 'SMOKE FAIL: thiếu cột inbound_receipt_line.lot_serial_id';
  END IF;
  IF to_regclass('app.v_lot_stock') IS NULL OR to_regclass('app.v_item_stock') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: thiếu view v_lot_stock / v_item_stock';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_txn_lot_guard') THEN
    RAISE EXCEPTION 'SMOKE FAIL: thiếu trigger inventory_txn_lot_guard';
  END IF;
  RAISE NOTICE 'OK 0: cột + view + trigger tồn tại';
END $$;

-- ── 1. Backfill hold_code: không còn lô HOLD mà hold_code NULL ──────
SELECT CASE WHEN COUNT(*) = 0 THEN 'PASS 1: mọi lô HOLD đã có hold_code'
            ELSE 'FAIL 1: ' || COUNT(*) || ' lô HOLD thiếu hold_code' END AS check_1
FROM app.inventory_lot_serial WHERE status = 'HOLD' AND hold_code IS NULL;

-- ── 2. Dữ liệu test (item + bin + 2 lô) ─────────────────────────────
DO $$
DECLARE
  v_item UUID;
  v_bin  UUID;
  v_lot_ok UUID;
  v_lot_hold UUID;
  v_row RECORD;
  v_blocked BOOLEAN;
BEGIN
  SELECT id INTO v_item FROM app.item WHERE is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_bin FROM app.location_bin WHERE is_active = true ORDER BY full_code LIMIT 1;
  IF v_item IS NULL OR v_bin IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: DB không có item/bin để test';
  END IF;

  INSERT INTO app.inventory_lot_serial (item_id, lot_code, status)
  VALUES (v_item, 'SMOKE-OK-' || substr(gen_random_uuid()::text, 1, 8), 'AVAILABLE')
  RETURNING id INTO v_lot_ok;
  INSERT INTO app.inventory_lot_serial (item_id, lot_code, status, hold_code, hold_reason)
  VALUES (v_item, 'SMOKE-HOLD-' || substr(gen_random_uuid()::text, 1, 8), 'HOLD', 'QC_PENDING', 'smoke')
  RETURNING id INTO v_lot_hold;

  -- Nhập 10 vào mỗi lô
  INSERT INTO app.inventory_txn (tx_type, item_id, qty, to_bin_id, lot_serial_id, ref_table)
  VALUES ('IN_RECEIPT', v_item, 10, v_bin, v_lot_ok, 'smoke'),
         ('IN_RECEIPT', v_item, 10, v_bin, v_lot_hold, 'smoke');

  -- 3. v_lot_stock: on_hand 10 cả 2; issuable 10 cho AVAILABLE, 0 cho HOLD
  SELECT * INTO v_row FROM app.v_lot_stock WHERE lot_serial_id = v_lot_ok;
  IF v_row.on_hand <> 10 OR v_row.issuable_qty <> 10 THEN
    RAISE EXCEPTION 'SMOKE FAIL 3a: lô AVAILABLE on_hand=% issuable=%', v_row.on_hand, v_row.issuable_qty;
  END IF;
  SELECT * INTO v_row FROM app.v_lot_stock WHERE lot_serial_id = v_lot_hold;
  IF v_row.on_hand <> 10 OR v_row.issuable_qty <> 0 OR v_row.hold_code <> 'QC_PENDING' THEN
    RAISE EXCEPTION 'SMOKE FAIL 3b: lô HOLD on_hand=% issuable=% hold_code=%', v_row.on_hand, v_row.issuable_qty, v_row.hold_code;
  END IF;
  RAISE NOTICE 'OK 3: v_lot_stock tính đúng on_hand / issuable (HOLD = 0)';

  -- 4. Trigger: OUT_ISSUE lô HOLD bị chặn
  v_blocked := false;
  BEGIN
    INSERT INTO app.inventory_txn (tx_type, item_id, qty, from_bin_id, lot_serial_id, ref_table)
    VALUES ('OUT_ISSUE', v_item, 1, v_bin, v_lot_hold, 'smoke');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LOT_NOT_ISSUABLE%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 4: OUT_ISSUE lô HOLD KHÔNG bị chặn'; END IF;

  -- ASSEMBLY_CONSUME / PROD_OUT lô HOLD cũng bị chặn
  v_blocked := false;
  BEGIN
    INSERT INTO app.inventory_txn (tx_type, item_id, qty, from_bin_id, lot_serial_id, ref_table)
    VALUES ('ASSEMBLY_CONSUME', v_item, 1, v_bin, v_lot_hold, 'smoke');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LOT_NOT_ISSUABLE%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 4b: ASSEMBLY_CONSUME lô HOLD KHÔNG bị chặn'; END IF;
  RAISE NOTICE 'OK 4: trigger chặn OUT_ISSUE / ASSEMBLY_CONSUME vào lô HOLD';

  -- 5. ADJUST_MINUS lô HOLD KHÔNG bị trigger chặn (admin huỷ hàng hỏng — chặn ở code)
  INSERT INTO app.inventory_txn (tx_type, item_id, qty, from_bin_id, lot_serial_id, ref_table)
  VALUES ('ADJUST_MINUS', v_item, 2, v_bin, v_lot_hold, 'smoke');
  SELECT * INTO v_row FROM app.v_lot_stock WHERE lot_serial_id = v_lot_hold;
  IF v_row.on_hand <> 8 THEN RAISE EXCEPTION 'SMOKE FAIL 5: on_hand sau ADJUST_MINUS = %', v_row.on_hand; END IF;
  RAISE NOTICE 'OK 5: ADJUST_MINUS lô HOLD đi qua trigger';

  -- 6. OUT_ISSUE lô AVAILABLE hợp lệ: xuất hết 10 → insert TRƯỚC rồi mới CONSUMED
  INSERT INTO app.inventory_txn (tx_type, item_id, qty, from_bin_id, lot_serial_id, ref_table)
  VALUES ('OUT_ISSUE', v_item, 10, v_bin, v_lot_ok, 'smoke');
  UPDATE app.inventory_lot_serial SET status = 'CONSUMED' WHERE id = v_lot_ok;
  SELECT * INTO v_row FROM app.v_lot_stock WHERE lot_serial_id = v_lot_ok;
  IF v_row.on_hand <> 0 OR v_row.issuable_qty <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL 6: lô đã xuất hết on_hand=% issuable=%', v_row.on_hand, v_row.issuable_qty;
  END IF;
  -- Sau khi CONSUMED, xuất thêm bị chặn
  v_blocked := false;
  BEGIN
    INSERT INTO app.inventory_txn (tx_type, item_id, qty, from_bin_id, lot_serial_id, ref_table)
    VALUES ('OUT_ISSUE', v_item, 1, v_bin, v_lot_ok, 'smoke');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LOT_NOT_ISSUABLE%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 6b: xuất lô CONSUMED KHÔNG bị chặn'; END IF;
  RAISE NOTICE 'OK 6: xuất hợp lệ (insert trước, CONSUMED sau) + chặn lô CONSUMED';

  -- 7. CHECK constraint hold_code
  v_blocked := false;
  BEGIN
    UPDATE app.inventory_lot_serial SET hold_code = 'BAD' WHERE id = v_lot_hold;
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 7: hold_code nhận giá trị rác'; END IF;
  RAISE NOTICE 'OK 7: CHECK hold_code';
END $$;

-- ── 8. v_item_stock khớp tổng v_lot_stock (10 SKU ngẫu nhiên có lô) ──
SELECT CASE WHEN COUNT(*) = 0 THEN 'PASS 8: v_item_stock khớp SUM(v_lot_stock)'
            ELSE 'FAIL 8: ' || COUNT(*) || ' item lệch' END AS check_8
FROM (
  SELECT i.item_id
  FROM app.v_item_stock i
  JOIN LATERAL (
    SELECT COALESCE(SUM(on_hand), 0) AS oh, COALESCE(SUM(issuable_qty), 0) AS iq
    FROM app.v_lot_stock l WHERE l.item_id = i.item_id
  ) x ON true
  WHERE i.on_hand_total <> x.oh OR i.issuable_qty <> x.iq
) d;

-- ── 9. Thông tin đối chiếu (không pass/fail): tồn HOLD trên toàn kho ──
SELECT COUNT(*) FILTER (WHERE hold_qty > 0) AS items_co_hold,
       SUM(hold_qty)                        AS tong_hold,
       SUM(issuable_qty)                    AS tong_kha_dung,
       SUM(on_hand_total)                   AS tong_ton
FROM app.v_item_stock;

-- ── 10. Hiệu năng: kế hoạch truy vấn tồn 1 lô / 1 item (kỳ vọng dùng
--        inventory_txn_lot_idx + reservation_lot_idx, KHÔNG Seq Scan toàn bảng)
EXPLAIN (COSTS OFF)
SELECT * FROM app.v_lot_stock
WHERE lot_serial_id = (SELECT id FROM app.inventory_lot_serial LIMIT 1);

EXPLAIN (COSTS OFF)
SELECT * FROM app.v_item_stock
WHERE item_id = (SELECT id FROM app.item LIMIT 1);

ROLLBACK;
