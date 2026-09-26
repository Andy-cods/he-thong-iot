-- V4.1 Đợt 1 hotfix — app.reservation_lock gọi sai chữ ký.
--
-- 0006c viết `pg_advisory_xact_lock(hashtext(...)::bigint, 0)` → Postgres chỉ có
-- (bigint) hoặc (int, int), nên mọi lời gọi lỗi
-- "function pg_advisory_xact_lock(bigint, integer) does not exist".
-- Trước Đợt 1 hàm gần như không được gọi trên prod; từ Đợt 1a mọi đường xuất
-- kho / QC / giữ lô / chuyển kệ đều gọi → 500.
--
-- Sửa: dùng dạng 2 khoá (int, int) — hashtext() trả int4, khoá 2 = 0 giữ đúng ý
-- "namespace giữ chỗ" ban đầu. Idempotent, chạy bằng hethong_app (owner).

BEGIN;

CREATE OR REPLACE FUNCTION app.reservation_lock(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_item_id::text), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION app.reservation_lock(UUID) TO hethong_app;

COMMIT;
