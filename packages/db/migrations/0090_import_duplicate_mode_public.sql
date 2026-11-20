-- =============================================================
-- 0090_import_duplicate_mode_public.sql  (hotfix 20/11/2026)
--   0088 chỉ thêm 'replace'/'new_code' vào app.import_duplicate_mode, nhưng cột
--   app.import_batch.duplicate_mode thực tế dùng kiểu public.import_duplicate_mode
--   (DB đời đầu drizzle-push tạo enum ở public) → commit "Ghi đè"/"Tạo mã mới"
--   lỗi 22P02 invalid input value for enum. Thêm giá trị vào CẢ HAI kiểu (nếu có).
-- IDEMPOTENT. PG ≥ 12.
-- =============================================================
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'app'] LOOP
    IF to_regtype(s || '.import_duplicate_mode') IS NOT NULL THEN
      EXECUTE format('ALTER TYPE %I.import_duplicate_mode ADD VALUE IF NOT EXISTS %L', s, 'replace');
      EXECUTE format('ALTER TYPE %I.import_duplicate_mode ADD VALUE IF NOT EXISTS %L', s, 'new_code');
    END IF;
  END LOOP;
END $$;

-- Kiểm: kiểu của cột phải nhận được 2 giá trị mới.
SELECT format_type(a.atttypid, NULL) AS column_type,
       (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = a.atttypid) AS labels
FROM pg_attribute a
WHERE a.attrelid = 'app.import_batch'::regclass AND a.attname = 'duplicate_mode';
