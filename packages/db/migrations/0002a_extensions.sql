-- =============================================================
-- Migration 0002a · Extensions (SUPERUSER required)
-- =============================================================
-- Chạy bằng user `postgres` (superuser mặc định trong image postgres:16-alpine),
-- KHÔNG chạy bằng `hethong_app` vì owner không có quyền tạo extension shared.
--
-- Apply:
--   docker cp 0002a_extensions.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U postgres -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/0002a_extensions.sql
--
-- Idempotent: IF NOT EXISTS -> chạy nhiều lần vẫn OK.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
