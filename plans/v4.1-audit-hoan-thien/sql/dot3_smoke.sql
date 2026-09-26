-- ════════════════════════════════════════════════════════════════════
-- V4.1 Đợt 3 — SMOKE TEST TAY cho 0063_fin_account_expense.sql +
--   0064_fin_transfer_payment_status.sql (nguồn thu/chi, chuyển quỹ nội bộ,
--   trạng thái đợt thanh toán). Gọi TRIGGER THẬT app.fin_account_recalc_balance,
--   khoá FOR UPDATE + advisory lock y như code, CHECK thật.
--
-- Chạy SAU khi apply 0063 (ngoài transaction) + 0064. Script tự ROLLBACK,
-- KHÔNG để lại dữ liệu:
--
--   docker cp plans/v4.1-audit-hoan-thien/sql/dot3_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/dot3_smoke.sql
--
-- Kết quả mong đợi: các NOTICE "OK …", cuối cùng ROLLBACK.
-- Bất kỳ 'SMOKE FAIL …' nào = migration/logic sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

-- ── 0. Đối tượng tồn tại ────────────────────────────────────────────
DO $$
DECLARE
  n_enum int;
  n_has int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM pg_enum e WHERE e.enumtypid = t.oid AND e.enumlabel = 'EXPENSE'))
    INTO n_enum, n_has
  FROM pg_type t WHERE t.typname = 'fin_account_type' AND t.typtype = 'e';
  IF n_enum = 0 OR n_has <> n_enum THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: % bản enum fin_account_type, chỉ % bản có EXPENSE (0063 chưa chạy đủ mọi schema)', n_enum, n_has;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='fin_transaction' AND column_name='transfer_group_id') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu fin_transaction.transfer_group_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='fin_payment' AND column_name='status')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='fin_payment' AND column_name='voided_at') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu fin_payment.status / voided_at';
  END IF;
  IF to_regclass('app.fin_transaction_transfer_group_idx') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu index fin_transaction_transfer_group_idx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_transaction_transfer_no_invoice_ck')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_payment_status_ck') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu CHECK fin_transaction_transfer_no_invoice_ck / fin_payment_status_ck';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='fin_transaction_recalc_balance' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu trigger fin_transaction_recalc_balance (0055)';
  END IF;
  RAISE NOTICE 'OK 0: enum EXPENSE (% bản), cột/index/CHECK/trigger tồn tại', n_enum;
END $$;

-- ── 1. Tạo 2 nguồn test: quỹ tiền mặt 5.000.000 + TK chi tiêu (EXPENSE) 0 ──
INSERT INTO app.fin_account (code, name, type, opening_balance, current_balance)
VALUES ('SMOKE-TM', 'SMOKE Quỹ tiền mặt', 'CASH', 5000000, 5000000),
       ('SMOKE-CT', 'SMOKE TK chi tiêu', 'EXPENSE', 0, 0);

DO $$
BEGIN
  IF (SELECT type::text FROM app.fin_account WHERE code='SMOKE-CT') <> 'EXPENSE' THEN
    RAISE EXCEPTION 'SMOKE FAIL 1: không lưu được loại EXPENSE';
  END IF;
  RAISE NOTICE 'OK 1: tạo được nguồn loại EXPENSE';
END $$;

-- ── 2. Chuyển quỹ 3.000.000 TM → CT đúng như createTransfer ─────────────
-- Khoá 2 nguồn theo thứ tự id (FOR UPDATE) + advisory lock sinh mã CQ.
DO $$
DECLARE
  v_tm uuid; v_ct uuid; v_grp uuid := gen_random_uuid();
  v_prefix text := 'CQ-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM');
  v_seq int; v_code text; v_bal numeric;
BEGIN
  SELECT id INTO v_tm FROM app.fin_account WHERE code='SMOKE-TM';
  SELECT id INTO v_ct FROM app.fin_account WHERE code='SMOKE-CT';
  PERFORM 1 FROM app.fin_account WHERE id IN (v_tm, v_ct) ORDER BY id FOR UPDATE;
  SELECT current_balance INTO v_bal FROM app.fin_account WHERE id = v_tm;
  IF v_bal - 3000000 < 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL 2: nguồn đi không đủ số dư (%)', v_bal;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('docno:' || v_prefix));
  SELECT COALESCE(MAX(CAST(SPLIT_PART(code, '-', 3) AS INTEGER)), 0) + 1 INTO v_seq
  FROM app.fin_transaction
  WHERE code LIKE v_prefix || '-%' AND code ~ ('^' || v_prefix || '-[0-9]+$');
  v_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO app.fin_transaction (code, direction, account_id, amount, transaction_date, description, transfer_group_id, status)
  VALUES (v_code,        'OUT', v_tm, 3000000, CURRENT_DATE, 'SMOKE chuyển quỹ', v_grp, 'POSTED'),
         (v_code || '-N','IN',  v_ct, 3000000, CURRENT_DATE, 'SMOKE chuyển quỹ', v_grp, 'POSTED');

  -- Trigger thật đã cập nhật số dư 2 nguồn.
  IF (SELECT current_balance FROM app.fin_account WHERE id=v_tm) <> 2000000
     OR (SELECT current_balance FROM app.fin_account WHERE id=v_ct) <> 3000000 THEN
    RAISE EXCEPTION 'SMOKE FAIL 2: trigger số dư sai sau chuyển quỹ (TM=% CT=%)',
      (SELECT current_balance FROM app.fin_account WHERE id=v_tm),
      (SELECT current_balance FROM app.fin_account WHERE id=v_ct);
  END IF;
  IF (SELECT count(*) FROM app.fin_transaction WHERE transfer_group_id = v_grp) <> 2
     OR (SELECT SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END)
         FROM app.fin_transaction WHERE transfer_group_id = v_grp) <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL 2: nhóm chuyển quỹ phải có đúng 2 chân, tổng = 0';
  END IF;
  -- Chân -N không làm hỏng dãy số: lần sinh mã kế tiếp vẫn là seq+1.
  IF (SELECT COALESCE(MAX(CAST(SPLIT_PART(code, '-', 3) AS INTEGER)), 0)
      FROM app.fin_transaction
      WHERE code LIKE v_prefix || '-%' AND code ~ ('^' || v_prefix || '-[0-9]+$')) <> v_seq THEN
    RAISE EXCEPTION 'SMOKE FAIL 2: chân -N lọt vào regex seq của genDocNo';
  END IF;
  RAISE NOTICE 'OK 2: chuyển quỹ % → TM 2.000.000 / CT 3.000.000 (trigger thật)', v_code;
END $$;

-- ── 3. Chuyển quỹ KHÔNG tính vào thu/chi (3 điểm tổng hợp lọc IS NULL) ──
DO $$
DECLARE v_in numeric; v_out numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount END),0),
         COALESCE(SUM(CASE WHEN direction='OUT' THEN amount END),0)
    INTO v_in, v_out
  FROM app.fin_transaction t
  JOIN app.fin_account a ON a.id = t.account_id
  WHERE a.code LIKE 'SMOKE-%' AND t.status='POSTED' AND t.transfer_group_id IS NULL;
  IF v_in <> 0 OR v_out <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL 3: chuyển quỹ lọt vào tổng thu/chi (in=% out=%)', v_in, v_out;
  END IF;
  RAISE NOTICE 'OK 3: tổng thu/chi (transfer_group_id IS NULL) = 0 cho nhóm chuyển quỹ';
END $$;

-- ── 4. Chi từ TK chi tiêu, rồi kiểm "chi vượt số dư" như lockSpendSource ──
DO $$
DECLARE v_ct uuid; v_bal numeric;
BEGIN
  SELECT id INTO v_ct FROM app.fin_account WHERE code='SMOKE-CT';
  SELECT current_balance INTO v_bal FROM app.fin_account WHERE id=v_ct FOR UPDATE;
  INSERT INTO app.fin_transaction (code, direction, account_id, amount, transaction_date, description, status)
  VALUES ('SMOKE-PC-1', 'OUT', v_ct, 1200000, CURRENT_DATE, 'SMOKE chi chi tiêu', 'POSTED');
  IF (SELECT current_balance FROM app.fin_account WHERE id=v_ct) <> 1800000 THEN
    RAISE EXCEPTION 'SMOKE FAIL 4: chi 1.200.000 từ CT phải còn 1.800.000';
  END IF;
  -- Phiếu 2.000.000 tiếp theo phải bị server chặn (1.800.000 - 2.000.000 < 0).
  SELECT current_balance INTO v_bal FROM app.fin_account WHERE id=v_ct FOR UPDATE;
  IF v_bal - 2000000 >= 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL 4: số dư khoá FOR UPDATE không phản ánh phiếu trước';
  END IF;
  RAISE NOTICE 'OK 4: chi từ TK chi tiêu trừ đúng nguồn; phiếu 2.000.000 sẽ bị 409 (còn %)', v_bal;
END $$;

-- ── 5. Huỷ 1 chân chuyển quỹ = huỷ cả nhóm → trigger hoàn số dư 2 nguồn ──
DO $$
DECLARE v_grp uuid;
BEGIN
  SELECT t.transfer_group_id INTO v_grp
  FROM app.fin_transaction t JOIN app.fin_account a ON a.id=t.account_id
  WHERE a.code='SMOKE-TM' AND t.transfer_group_id IS NOT NULL LIMIT 1;
  UPDATE app.fin_transaction SET status='VOID', updated_at=now() WHERE transfer_group_id = v_grp;
  IF (SELECT current_balance FROM app.fin_account WHERE code='SMOKE-TM') <> 5000000
     OR (SELECT current_balance FROM app.fin_account WHERE code='SMOKE-CT') <> -1200000 THEN
    RAISE EXCEPTION 'SMOKE FAIL 5: huỷ nhóm chuyển quỹ phải hoàn TM=5.000.000, CT=-1.200.000 (TM=% CT=%)',
      (SELECT current_balance FROM app.fin_account WHERE code='SMOKE-TM'),
      (SELECT current_balance FROM app.fin_account WHERE code='SMOKE-CT');
  END IF;
  RAISE NOTICE 'OK 5: huỷ cả nhóm chuyển quỹ → số dư 2 nguồn tính lại bằng trigger thật (CT âm vì phiếu chi SMOKE-PC-1 vẫn còn — đúng lý do phải chặn chi vượt)';
END $$;

-- ── 6. CHECK: chân chuyển quỹ không được gắn hoá đơn/thanh toán ─────────
DO $$
DECLARE v_inv uuid; v_tm uuid;
BEGIN
  SELECT id INTO v_tm FROM app.fin_account WHERE code='SMOKE-TM';
  INSERT INTO app.fin_invoice (invoice_no, direction, issue_date, subtotal_amount, vat_rate, vat_amount, total_amount)
  VALUES ('SMOKE-HD-1', 'IN', CURRENT_DATE, 100000, 0, 0, 100000) RETURNING id INTO v_inv;
  BEGIN
    INSERT INTO app.fin_transaction (code, direction, account_id, amount, transaction_date, invoice_id, transfer_group_id)
    VALUES ('SMOKE-BAD-1', 'OUT', v_tm, 100000, CURRENT_DATE, v_inv, gen_random_uuid());
    RAISE EXCEPTION 'SMOKE FAIL 6: CHECK fin_transaction_transfer_no_invoice_ck không chặn';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 6: CHECK chặn chân chuyển quỹ gắn hoá đơn';
  END;
END $$;

-- ── 7. fin_payment.status: mặc định POSTED, chỉ nhận POSTED/VOID ─────────
DO $$
DECLARE v_tm uuid; v_pay uuid;
BEGIN
  SELECT id INTO v_tm FROM app.fin_account WHERE code='SMOKE-TM';
  INSERT INTO app.fin_payment (code, direction, account_id, payment_date, total_amount)
  VALUES ('SMOKE-TT-1', 'OUT', v_tm, CURRENT_DATE, 100000) RETURNING id INTO v_pay;
  IF (SELECT status FROM app.fin_payment WHERE id=v_pay) <> 'POSTED' THEN
    RAISE EXCEPTION 'SMOKE FAIL 7: fin_payment.status mặc định phải POSTED';
  END IF;
  UPDATE app.fin_payment SET status='VOID', voided_at=now() WHERE id=v_pay;
  BEGIN
    UPDATE app.fin_payment SET status='CANCELLED' WHERE id=v_pay;
    RAISE EXCEPTION 'SMOKE FAIL 7: CHECK fin_payment_status_ck không chặn';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 7: fin_payment.status POSTED→VOID được, giá trị lạ bị CHECK chặn';
  END;
END $$;

-- ── 8. Backfill 0064 không để sót đợt thanh toán "ma" ────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM app.fin_payment p
  WHERE p.status = 'POSTED'
    AND EXISTS (SELECT 1 FROM app.fin_transaction t WHERE t.payment_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM app.fin_transaction t WHERE t.payment_id = p.id AND t.status='POSTED');
  IF n > 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL 8: còn % đợt thanh toán POSTED nhưng mọi giao dịch đã VOID', n;
  END IF;
  RAISE NOTICE 'OK 8: không còn đợt thanh toán đã huỷ mà vẫn POSTED';
END $$;

ROLLBACK;
