-- ════════════════════════════════════════════════════════════════════
-- V4.1 Đợt 1b — SMOKE TEST TAY cho migration 0060_goods_issue.sql
--   (goods_issue / goods_issue_line, unique 1 phiếu / ISR, material_request
--    PARTIAL, CHECK inventory_txn_out_requires_bin NOT VALID)
--
-- Chạy SAU khi apply 0060 (script tự ROLLBACK, KHÔNG để lại dữ liệu):
--
--   docker cp plans/v4.1-audit-hoan-thien/sql/dot1b_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/dot1b_smoke.sql
--
-- Kết quả mong đợi: NOTICE "OK …" + các dòng "PASS"/thông tin, cuối cùng
-- ROLLBACK. Bất kỳ 'SMOKE FAIL …' nào = migration sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

-- ── 0. Đối tượng tồn tại ────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('app.goods_issue') IS NULL OR to_regclass('app.goods_issue_line') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu bảng goods_issue / goods_issue_line';
  END IF;
  IF to_regclass('app.goods_issue_no_uk') IS NULL OR to_regclass('app.goods_issue_isr_uk') IS NULL
     OR to_regclass('app.goods_issue_line_txn_uk') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu unique index goods_issue_no_uk / goods_issue_isr_uk / goods_issue_line_txn_uk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_txn_out_requires_bin'
                   AND conrelid = 'app.inventory_txn'::regclass AND NOT convalidated) THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu CHECK inventory_txn_out_requires_bin (NOT VALID)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_request_status_ck'
                   AND conrelid = 'app.material_request'::regclass) THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu CHECK material_request_status_ck';
  END IF;
  RAISE NOTICE 'OK 0: bảng + index + constraint tồn tại';
END $$;

-- ── 1. Chỉ còn ĐÚNG 1 CHECK nhắc status trên material_request ──────
SELECT CASE WHEN COUNT(*) = 1 THEN 'PASS 1: material_request chỉ còn 1 CHECK status (có PARTIAL)'
            ELSE 'FAIL 1: ' || COUNT(*) || ' CHECK status trên material_request' END AS check_1
FROM pg_constraint
WHERE conrelid = 'app.material_request'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%status%';

-- ── 2..6. Dữ liệu test ─────────────────────────────────────────────
DO $$
DECLARE
  v_user UUID;
  v_item UUID;
  v_bin  UUID;
  v_lot  UUID;
  v_mr   UUID;
  v_mrl  UUID;
  v_isr  UUID;
  v_gi   UUID;
  v_gi2  UUID;
  v_txn  UUID;
  v_blocked BOOLEAN;
BEGIN
  SELECT id INTO v_user FROM app.user_account ORDER BY created_at LIMIT 1;
  SELECT id INTO v_item FROM app.item WHERE is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_bin  FROM app.location_bin WHERE is_active = true ORDER BY full_code LIMIT 1;
  IF v_user IS NULL OR v_item IS NULL OR v_bin IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: DB không có user/item/bin để test';
  END IF;

  INSERT INTO app.inventory_lot_serial (item_id, lot_code, status)
  VALUES (v_item, 'SMOKE1B-' || substr(gen_random_uuid()::text, 1, 8), 'AVAILABLE')
  RETURNING id INTO v_lot;
  INSERT INTO app.inventory_txn (tx_type, item_id, qty, to_bin_id, lot_serial_id, ref_table)
  VALUES ('IN_RECEIPT', v_item, 10, v_bin, v_lot, 'smoke');

  -- 2. material_request nhận PARTIAL, từ chối trạng thái rác
  INSERT INTO app.material_request (request_no, status, requested_by)
  VALUES ('SMOKE-MR-' || substr(gen_random_uuid()::text, 1, 8), 'PENDING', v_user)
  RETURNING id INTO v_mr;
  INSERT INTO app.material_request_line (request_id, line_no, item_id, requested_qty)
  VALUES (v_mr, 1, v_item, 5) RETURNING id INTO v_mrl;
  UPDATE app.material_request SET status = 'PARTIAL' WHERE id = v_mr;
  v_blocked := false;
  BEGIN
    UPDATE app.material_request SET status = 'BOGUS' WHERE id = v_mr;
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 2: material_request.status nhận giá trị rác'; END IF;
  RAISE NOTICE 'OK 2: material_request.status nhận PARTIAL, chặn giá trị rác';

  -- 3. Phiếu xuất cho phiếu yêu cầu: header + txn (ref goods_issue) + dòng
  INSERT INTO app.goods_issue (issue_no, source_type, reason, material_request_id, total_qty, issued_by)
  VALUES ('PX-SMOKE-0001', 'MATERIAL_REQUEST', 'production', v_mr, 3, v_user)
  RETURNING id INTO v_gi;
  INSERT INTO app.inventory_txn (tx_type, item_id, qty, from_bin_id, lot_serial_id, ref_table, ref_id)
  VALUES ('OUT_ISSUE', v_item, 3, v_bin, v_lot, 'goods_issue', v_gi)
  RETURNING id INTO v_txn;
  INSERT INTO app.goods_issue_line (goods_issue_id, line_no, item_id, lot_serial_id, bin_id, qty,
                                    inventory_txn_id, material_request_line_id)
  VALUES (v_gi, 1, v_item, v_lot, v_bin, 3, v_txn, v_mrl);
  IF (SELECT on_hand FROM app.v_lot_stock WHERE lot_serial_id = v_lot) <> 7 THEN
    RAISE EXCEPTION 'SMOKE FAIL 3: tồn lô sau xuất phiếu PX ≠ 7';
  END IF;
  RAISE NOTICE 'OK 3: phiếu xuất + txn OUT_ISSUE + dòng phiếu, tồn lô trừ đúng';

  -- 3b. 1 txn chỉ thuộc 1 dòng phiếu (goods_issue_line_txn_uk)
  v_blocked := false;
  BEGIN
    INSERT INTO app.goods_issue_line (goods_issue_id, line_no, item_id, lot_serial_id, bin_id, qty, inventory_txn_id)
    VALUES (v_gi, 2, v_item, v_lot, v_bin, 3, v_txn);
  EXCEPTION WHEN unique_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 3b: 1 txn gắn được 2 dòng phiếu'; END IF;

  -- 3c. qty ≤ 0 bị chặn; source_type rác bị chặn; trùng số PX bị chặn
  v_blocked := false;
  BEGIN
    INSERT INTO app.goods_issue (issue_no, source_type, issued_by) VALUES ('PX-SMOKE-0009', 'FOO', v_user);
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 3c: source_type rác không bị chặn'; END IF;
  v_blocked := false;
  BEGIN
    INSERT INTO app.goods_issue (issue_no, source_type, issued_by) VALUES ('PX-SMOKE-0001', 'QUICK_ISSUE', v_user);
  EXCEPTION WHEN unique_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 3c: trùng số PX không bị chặn'; END IF;
  RAISE NOTICE 'OK 3b/3c: unique txn, CHECK source_type, unique issue_no';

  -- 4. ISR: 1 yêu cầu xuất kho ↔ tối đa 1 phiếu xuất (goods_issue_isr_uk)
  INSERT INTO app.warehouse_issue_request (request_no, status, requested_by)
  VALUES ('SMOKE-ISR-' || substr(gen_random_uuid()::text, 1, 8), 'COMPLETED', v_user)
  RETURNING id INTO v_isr;
  INSERT INTO app.goods_issue (issue_no, source_type, reason, issue_request_id, issued_by)
  VALUES ('PX-SMOKE-0002', 'ISSUE_REQUEST', 'manual', v_isr, v_user)
  RETURNING id INTO v_gi2;
  v_blocked := false;
  BEGIN
    INSERT INTO app.goods_issue (issue_no, source_type, reason, issue_request_id, issued_by)
    VALUES ('PX-SMOKE-0003', 'ISSUE_REQUEST', 'manual', v_isr, v_user);
  EXCEPTION WHEN unique_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 4: 1 ISR sinh được 2 phiếu xuất (duyệt 2 lần)'; END IF;
  -- Phiếu không gắn ISR (NULL) thì nhiều phiếu vẫn được (partial index).
  INSERT INTO app.goods_issue (issue_no, source_type, issued_by) VALUES ('PX-SMOKE-0004', 'QUICK_ISSUE', v_user);
  INSERT INTO app.goods_issue (issue_no, source_type, issued_by) VALUES ('PX-SMOKE-0005', 'QUICK_ISSUE', v_user);
  RAISE NOTICE 'OK 4: goods_issue_isr_uk chặn duyệt ISR 2 lần, không ảnh hưởng phiếu không ISR';

  -- 5. CHECK bin: txn xuất KHÔNG bin bị chặn (dòng mới), có bin thì qua
  v_blocked := false;
  BEGIN
    INSERT INTO app.inventory_txn (tx_type, item_id, qty, ref_table)
    VALUES ('ADJUST_MINUS', v_item, 1, 'smoke');
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 5: ADJUST_MINUS không bin KHÔNG bị chặn'; END IF;
  v_blocked := false;
  BEGIN
    INSERT INTO app.inventory_txn (tx_type, item_id, qty, lot_serial_id, ref_table)
    VALUES ('ASSEMBLY_CONSUME', v_item, 1, v_lot, 'smoke');
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 5b: ASSEMBLY_CONSUME không bin KHÔNG bị chặn'; END IF;
  -- Nhập (IN_RECEIPT) không có from_bin vẫn hợp lệ.
  INSERT INTO app.inventory_txn (tx_type, item_id, qty, to_bin_id, lot_serial_id, ref_table)
  VALUES ('IN_RECEIPT', v_item, 1, v_bin, v_lot, 'smoke');
  RAISE NOTICE 'OK 5: CHECK inventory_txn_out_requires_bin chặn txn xuất không bin, không chặn nhập';
END $$;

-- ── 6. Thông tin (không pass/fail): txn xuất KHÔNG bin trong lịch sử —
--       CHECK NOT VALID nên không lỗi; xem báo cáo "Đối soát trước kiểm kê".
SELECT tx_type, COUNT(*) AS so_txn, SUM(qty) AS tong_sl
FROM app.inventory_txn
WHERE tx_type IN ('OUT_ISSUE','ADJUST_MINUS','ASSEMBLY_CONSUME') AND from_bin_id IS NULL
GROUP BY tx_type;

-- ── 7. Thông tin: phiếu yêu cầu DELIVERED chưa có phiếu xuất (đối soát D4)
SELECT COUNT(*) AS mr_delivered_khong_phieu_xuat
FROM app.material_request mr
WHERE mr.status = 'DELIVERED'
  AND NOT EXISTS (SELECT 1 FROM app.goods_issue gi WHERE gi.material_request_id = mr.id);

ROLLBACK;
