-- V4.1 Đợt 3 — Chuyển quỹ nội bộ (Q7) + trạng thái đợt thanh toán (TC-06).
--
-- Bối cảnh (plans/v4.1-audit-hoan-thien/AUDIT.md §5, DOT3_PLAN.md §1-§2):
--   1. Chuyển quỹ nội bộ (VD rút quỹ tiền mặt nạp TK chi tiêu): 1 lần chuyển =
--      1 dòng OUT (nguồn đi) + 1 dòng IN (nguồn nhận) trong fin_transaction,
--      nối bằng `transfer_group_id`. Trigger fin_account_recalc_balance (0055)
--      tự trừ/cộng số dư 2 nguồn — KHÔNG sửa trigger. Báo cáo thu/chi lọc
--      `transfer_group_id IS NULL` (tiền không ra khỏi công ty).
--   2. fin_payment trước đây không có trạng thái → thanh toán đã huỷ vẫn hiện
--      như bình thường (TC-06). Thêm `status` POSTED/VOID + `voided_at`.
--
-- Chạy SAU 0063 (0063 phải chạy NGOÀI transaction). File này bọc BEGIN/COMMIT.
-- Idempotent. User: hethong_app. Apply TRƯỚC khi deploy code Đợt 3.

BEGIN;

SET search_path TO app, public;

-- ════════════════════════════════════════════════════════════════════
-- 1. Chuyển quỹ nội bộ
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.fin_transaction ADD COLUMN IF NOT EXISTS transfer_group_id UUID;

CREATE INDEX IF NOT EXISTS fin_transaction_transfer_group_idx
  ON app.fin_transaction (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

-- Chân chuyển quỹ không được gắn hoá đơn / đợt thanh toán (nếu gắn sẽ vừa bị
-- loại khỏi báo cáo thu/chi vừa trả nợ hoá đơn → sai số).
DO $$ BEGIN
  ALTER TABLE app.fin_transaction ADD CONSTRAINT fin_transaction_transfer_no_invoice_ck
    CHECK (transfer_group_id IS NULL OR (invoice_id IS NULL AND payment_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN app.fin_transaction.transfer_group_id IS
  'V4.1 Đợt 3 — Nhóm chuyển quỹ nội bộ: đúng 1 dòng OUT + 1 dòng IN cùng giá trị. NULL = giao dịch thu/chi thật. Báo cáo thu/chi lọc transfer_group_id IS NULL; huỷ 1 chân = huỷ cả nhóm.';

-- ════════════════════════════════════════════════════════════════════
-- 2. Trạng thái đợt thanh toán (TC-06)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.fin_payment ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'POSTED';
ALTER TABLE app.fin_payment ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE app.fin_payment ADD CONSTRAINT fin_payment_status_ck
    CHECK (status IN ('POSTED', 'VOID'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: đợt thanh toán đã huỷ trước đây = có giao dịch nhưng KHÔNG còn
-- giao dịch POSTED nào (voidPaymentWithAllocations void hết txn + xoá allocation).
UPDATE app.fin_payment p
SET status = 'VOID'
WHERE p.status = 'POSTED'
  AND EXISTS (SELECT 1 FROM app.fin_transaction t WHERE t.payment_id = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM app.fin_transaction t
    WHERE t.payment_id = p.id AND t.status = 'POSTED'
  );

COMMIT;
