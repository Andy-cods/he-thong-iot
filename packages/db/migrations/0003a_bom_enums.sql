-- =============================================================
-- Migration 0003a · V1.1-alpha · BOM enums (SUPERUSER)
-- =============================================================
-- Chạy bằng superuser `postgres`.
-- Lý do split giống 0002a: giữ convention superuser tạo enum + grant
-- usage cho hethong_app.
--
-- Apply:
--   docker cp packages/db/migrations/0003a_bom_enums.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U postgres -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/0003a_bom_enums.sql
-- =============================================================

-- Bảo đảm extension pg_trgm + unaccent vẫn hiện diện (0002a đã làm, kiểm tra double)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- BOM status enum
DO $$ BEGIN
  CREATE TYPE app.bom_status AS ENUM ('DRAFT','ACTIVE','OBSOLETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Grant usage cho hethong_app
GRANT USAGE ON TYPE app.bom_status TO hethong_app;

-- NOTE: bom_unit_kind KHÔNG cook enum — reuse varchar uom đã có trên item + bom_line.
-- Defer enum UoM sang V1.2 khi tách riêng master UoM.
