-- "Đạt một phần" cho phiếu nhận hàng: thêm giá trị PARTIAL vào enum qc_flag.
-- DRIFT-NOTES mục 1: enum có thể nằm ở public (prod) hoặc app (môi trường
-- tạo mới) — thêm vào bất kỳ schema nào đang có. Idempotent.
DO $$
DECLARE s text;
BEGIN
  FOR s IN SELECT n.nspname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'qc_flag' AND n.nspname IN ('app','public')
  LOOP
    EXECUTE format('ALTER TYPE %I.qc_flag ADD VALUE IF NOT EXISTS %L', s, 'PARTIAL');
  END LOOP;
END $$;
