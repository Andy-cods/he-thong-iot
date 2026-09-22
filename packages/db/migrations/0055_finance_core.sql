-- V4.0 đợt 2 (TASK-20260922-001) — Phase A: Phân hệ Tài chính, phần migration SQL.
--
-- ================================ THỨ TỰ CHẠY (BẮT BUỘC) ===================
-- 1. `pnpm --filter @iot/db drizzle-kit push` TRƯỚC — tạo 6 bảng `fin_*` +
--    6 enum mới (fin_account_type, fin_direction, fin_counterparty_type,
--    fin_transaction_status, fin_invoice_status, fin_payment_method) từ
--    `packages/db/src/schema/finance.ts`. File SQL này KHÔNG tạo bảng nào —
--    theo quy tắc `packages/db/DRIFT-NOTES.md` mục 4 (W.11): bảng mới luôn tạo
--    bằng drizzle-kit push, KHÔNG bằng CREATE TABLE trong migration.
-- 2. File SQL NÀY chạy SAU — vì (a) ALTER TYPE lên enum `import_kind` đã tồn
--    tại từ trước (không phải Drizzle quản lý, phải ALTER tay), (b) trigger
--    bên dưới tham chiếu `app.fin_transaction`/`app.fin_account` — bảng phải
--    tồn tại trước khi CREATE TRIGGER trên nó, (c) seed `app.fin_category`
--    cũng cần bảng đã tồn tại.
--
-- KHÔNG bọc toàn file trong 1 transaction/`--single-transaction` — ALTER TYPE
-- ADD VALUE phải tự commit trước khi dùng giá trị mới trong cùng phiên (theo
-- đúng precedent `0050_accountant_role.sql`).
--
-- QUYẾT ĐỊNH quan trọng đã chốt ở plan (xem wave-2-finance.md §A.3):
--   - Trigger SQL CHỈ áp dụng cho `fin_account.current_balance` (đơn giản,
--     full re-scan SUM, chấp nhận O(n) vì quy mô nhỏ — xưởng cơ khí).
--   - `fin_invoice.paidAmount`/`status` KHÔNG dùng trigger — tính ở
--     application layer (`apps/web/src/server/repos/finPayments.ts`,
--     hàm `recalcInvoicePaidAmount`, sẽ viết ở Phase B) để tránh lock
--     contention khi import/insert hàng loạt allocation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Mở rộng enum import_kind (ĐÃ TỒN TẠI — cần ALTER, không phải tạo mới).
--    Bắt buộc chạy TRƯỚC khi deploy code Phase D (insert kind='finance_transaction').
--
-- ⚠ CẠM BẪY THỰC TẾ (phát hiện khi dry-run 2026-09-22, xem DRIFT-NOTES mục 1):
-- trên prod enum `import_kind` tồn tại ở CẢ HAI schema `app` VÀ `public`
-- (drizzle-kit push tạo ở public, migration SQL cũ tạo ở app). Vì vậy:
--   - `SELECT oid FROM pg_type WHERE typname='import_kind'` trả về 2 DÒNG →
--     subquery dùng làm expression sẽ lỗi "more than one row returned".
--   - `ALTER TYPE import_kind` không qualify schema sẽ chỉ sửa đúng 1 bản theo
--     search_path, bản còn lại vẫn thiếu giá trị → lỗi khó lần về sau.
-- Cách xử lý: LẶP qua mọi schema có enum này và ALTER từng bản.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, t.oid AS type_oid
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'import_kind' AND t.typtype = 'e'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = r.type_oid AND enumlabel = 'finance_transaction'
    ) THEN
      EXECUTE format(
        'ALTER TYPE %I.import_kind ADD VALUE %L',
        r.schema_name, 'finance_transaction'
      );
      RAISE NOTICE 'Đã thêm finance_transaction vào %.import_kind', r.schema_name;
    ELSE
      RAISE NOTICE 'Bỏ qua %.import_kind (đã có finance_transaction)', r.schema_name;
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Trigger tự tính fin_account.current_balance khi fin_transaction thay đổi.
--    Full re-scan SUM theo account_id mỗi lần thay đổi (KISS, chủ đích đơn
--    giản hoá) — đúng bất kể loại thay đổi (kể cả UPDATE đổi account_id giữa
--    2 tài khoản), chấp nhận chi phí O(n) vì quy mô giao dịch nhỏ (xưởng cơ khí).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fin_account_recalc_balance() RETURNS TRIGGER AS $$
DECLARE
  affected_account UUID;
BEGIN
  affected_account := COALESCE(NEW.account_id, OLD.account_id);
  UPDATE app.fin_account
  SET current_balance = opening_balance + COALESCE((
    SELECT SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END)
    FROM app.fin_transaction
    WHERE account_id = affected_account AND status = 'POSTED'
  ), 0)
  WHERE id = affected_account;

  -- UPDATE có thể đổi account_id (chuyển giao dịch giữa 2 tài khoản) — nếu vậy
  -- phải recalc CẢ tài khoản cũ (OLD.account_id) lẫn tài khoản mới (NEW.account_id).
  IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    UPDATE app.fin_account
    SET current_balance = opening_balance + COALESCE((
      SELECT SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END)
      FROM app.fin_transaction
      WHERE account_id = OLD.account_id AND status = 'POSTED'
    ), 0)
    WHERE id = OLD.account_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.fin_account_recalc_balance() IS
  'Tài chính V4 — Recalc fin_account.current_balance bằng full re-scan SUM(fin_transaction WHERE status=POSTED). KISS: chấp nhận O(n) vì quy mô xưởng cơ khí nhỏ (không phải ngân hàng).';

DROP TRIGGER IF EXISTS fin_transaction_recalc_balance ON app.fin_transaction;
CREATE TRIGGER fin_transaction_recalc_balance
  AFTER INSERT OR UPDATE OF amount, direction, status, account_id OR DELETE
  ON app.fin_transaction
  FOR EACH ROW EXECUTE FUNCTION app.fin_account_recalc_balance();

-- ----------------------------------------------------------------------------
-- 3. Seed danh mục thu/chi mặc định cho xưởng cơ khí VN (idempotent).
-- ----------------------------------------------------------------------------
INSERT INTO app.fin_category (code, name, direction) VALUES
  ('CHI_NGUYENLIEU', 'Chi nguyên vật liệu', 'OUT'),
  ('CHI_GIACONG',    'Chi phí gia công ngoài', 'OUT'),
  ('CHI_LUONG',      'Chi lương nhân viên', 'OUT'),
  ('CHI_DIENNUOC',   'Chi điện nước', 'OUT'),
  ('CHI_VANCHUYEN',  'Chi vận chuyển', 'OUT'),
  ('CHI_DUNGCU',     'Chi dụng cụ', 'OUT'),
  ('CHI_KHAC',       'Chi khác', 'OUT'),
  ('THU_BANHANG',    'Thu bán hàng', 'IN'),
  ('THU_GIACONG',    'Thu gia công', 'IN'),
  ('THU_KHAC',       'Thu khác', 'IN')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Index đặc thù không tự sinh qua Drizzle — partial index cho danh sách
--    công nợ/hoá đơn chưa thanh toán quá hạn (Phase C: GET /receivables/aging).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS fin_invoice_overdue_idx ON app.fin_invoice (due_date)
  WHERE status IN ('UNPAID', 'PARTIAL');
