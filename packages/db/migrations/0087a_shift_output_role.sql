-- =============================================================
-- 0087a_shift_output_role.sql — V4.10 (TASK-20261118-001) Sản lượng ca Đông Anh
-- Thêm giá trị 'workshop' (Xưởng vệ tinh) vào enum role_code.
--
-- ⚠ CHẠY NGOÀI TRANSACTION (KHÔNG BEGIN/COMMIT, KHÔNG psql --single-transaction):
--   giá trị enum vừa ADD VALUE không dùng được trong cùng transaction → 0087b
--   (INSERT app.role code='workshop') phải chạy SAU khi file này đã commit.
--
-- ⚠ Enum có thể tồn tại ở CẢ `app` VÀ `public` (drizzle-kit push từng tạo ở
--   public — DRIFT-NOTES mục 1) → LẶP mọi schema có enum role_code (precedent 0063).
--
-- Idempotent. User: hethong_app.
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1 -f /tmp/0087a_shift_output_role.sql
-- =============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, t.oid AS type_oid
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'role_code' AND t.typtype = 'e'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum WHERE enumtypid = r.type_oid AND enumlabel = 'workshop'
    ) THEN
      EXECUTE format('ALTER TYPE %I.role_code ADD VALUE IF NOT EXISTS %L', r.schema_name, 'workshop');
      RAISE NOTICE 'Đã thêm workshop vào %.role_code', r.schema_name;
    ELSE
      RAISE NOTICE 'Bỏ qua %.role_code (đã có workshop)', r.schema_name;
    END IF;
  END LOOP;
END $$;
