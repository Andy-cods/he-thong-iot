-- =============================================================
-- Migration 0002c · Fix GIN unaccent index (IMMUTABLE wrapper)
-- =============================================================
-- Chạy bằng superuser (hethong_app là POSTGRES_USER, có perm CREATE FUNCTION).
-- Bổ sung sau khi 0002b partial failed: unaccent() không IMMUTABLE by default
-- (depends on dict, có thể thay đổi). Postgres reject trong GIN expression.
-- Fix: wrap `unaccent('unaccent', $1)` trong IMMUTABLE function rồi dùng.
-- =============================================================

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Recreate GIN trgm index cho item.name dùng wrapper IMMUTABLE
DROP INDEX IF EXISTS app.item_name_unaccent_trgm_idx;

CREATE INDEX IF NOT EXISTS item_name_unaccent_trgm_idx
  ON app.item USING GIN (public.f_unaccent(name) gin_trgm_ops);

-- Verify cả 2 index đã exist (item_sku_trgm_idx + item_name_unaccent_trgm_idx)
DO $$
DECLARE
  sku_idx_exists boolean;
  name_idx_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='item_sku_trgm_idx') INTO sku_idx_exists;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='item_name_unaccent_trgm_idx') INTO name_idx_exists;
  IF NOT sku_idx_exists THEN
    RAISE WARNING 'item_sku_trgm_idx MISSING — search theo SKU sẽ chậm';
  END IF;
  IF NOT name_idx_exists THEN
    RAISE EXCEPTION 'item_name_unaccent_trgm_idx FAILED to create';
  END IF;
  RAISE NOTICE 'GIN indexes OK: sku=%, name_unaccent=%', sku_idx_exists, name_idx_exists;
END $$;
