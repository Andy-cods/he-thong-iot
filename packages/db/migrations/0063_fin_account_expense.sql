-- V4.1 Đợt 3 (Q7) — Thêm loại nguồn tiền EXPENSE = "Tài khoản chi tiêu".
--
-- Bối cảnh (plans/v4.1-audit-hoan-thien/AUDIT.md §0 Q7, §5; DOT3_PLAN.md §2):
--   Thu/chi phải có "nguồn thu / nguồn chi": chi tiền mặt trừ quỹ tiền mặt,
--   chi chi tiêu trừ tài khoản chi tiêu… Cơ chế trừ/cộng theo nguồn đã đúng
--   (trigger app.fin_account_recalc_balance, 0055) — chỉ thiếu loại nguồn.
--   D9: KHÔNG thêm loại "Khác" — chỉ BANK / CASH / EXPENSE.
--
-- ⚠ CHẠY NGOÀI TRANSACTION (KHÔNG BEGIN/COMMIT, KHÔNG psql --single-transaction):
--   giá trị enum mới vừa ADD VALUE không dùng được trong cùng transaction.
--   Chạy file này TRƯỚC 0064 và TRƯỚC khi deploy code Đợt 3.
--
-- ⚠ Enum có thể tồn tại ở CẢ `app` VÀ `public` (drizzle-kit push từng tạo ở
--   public — xem 0055_finance_core.sql mục 1, DRIFT-NOTES mục 1) → LẶP qua mọi
--   schema có enum này và ALTER từng bản (giống hệt precedent 0055).
--
-- Idempotent: chạy lại nhiều lần không lỗi. User: hethong_app.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, t.oid AS type_oid
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'fin_account_type' AND t.typtype = 'e'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = r.type_oid AND enumlabel = 'EXPENSE'
    ) THEN
      EXECUTE format(
        'ALTER TYPE %I.fin_account_type ADD VALUE IF NOT EXISTS %L',
        r.schema_name, 'EXPENSE'
      );
      RAISE NOTICE 'Đã thêm EXPENSE vào %.fin_account_type', r.schema_name;
    ELSE
      RAISE NOTICE 'Bỏ qua %.fin_account_type (đã có EXPENSE)', r.schema_name;
    END IF;
  END LOOP;
END $$;
