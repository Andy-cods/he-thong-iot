-- =============================================================
-- 0089_shift_output_p2.sql — Sản lượng ca P2 (xưởng Đông Anh)
--
--  1. shift_output_entry.work_start / work_end (time, NULL) — giờ chạy THỰC TẾ
--     của dòng (mặc định = giờ ca ở form). work_end <= work_start = qua nửa đêm.
--     shift_output_entry.shift_minutes giữ nghĩa "phút khả dụng của dòng": dòng
--     có giờ thực tế → app ghi = phút thực tế. Dòng cũ / demo (NULL) KHÔNG đổi.
--  2. site_part.image_asset_id → bom_asset(id) (kho ảnh dedup sha256, 0083).
--
-- Phụ thuộc: 0083 (bom_asset) + 0087b (bảng Sản lượng ca) ĐÃ chạy.
-- IDEMPOTENT (ADD COLUMN IF NOT EXISTS + DO $$ kiểm pg_constraint).
--   docker cp packages/db/migrations/0089_shift_output_p2.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1 -f /tmp/0089_shift_output_p2.sql
-- Rollback (chỉ khi chưa có dữ liệu cần giữ):
--   ALTER TABLE app.shift_output_entry DROP CONSTRAINT IF EXISTS shift_output_entry_work_window_chk,
--     DROP COLUMN IF EXISTS work_start, DROP COLUMN IF EXISTS work_end;
--   ALTER TABLE app.site_part DROP COLUMN IF EXISTS image_asset_id;
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

-- ── 1. Giờ chạy thực tế ────────────────────────────────────────────────
ALTER TABLE app.shift_output_entry ADD COLUMN IF NOT EXISTS work_start time;
ALTER TABLE app.shift_output_entry ADD COLUMN IF NOT EXISTS work_end   time;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_work_window_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_work_window_chk CHECK (
      (work_start IS NULL AND work_end IS NULL)
      OR (work_start IS NOT NULL AND work_end IS NOT NULL AND work_start <> work_end)
    );
  END IF;
END $$;

COMMENT ON COLUMN app.shift_output_entry.work_start IS
  'Giờ bắt đầu chạy thực tế (giờ địa phương site). NULL = dòng P1, phút theo ca.';
COMMENT ON COLUMN app.shift_output_entry.work_end IS
  'Giờ kết thúc chạy thực tế; <= work_start nghĩa là qua nửa đêm.';
COMMENT ON COLUMN app.shift_output_entry.shift_minutes IS
  'Phút khả dụng của dòng (snapshot): = phút(work_start→work_end) nếu có, ngược lại = độ dài ca lúc nhập.';

-- ── 2. Ảnh mã hàng ─────────────────────────────────────────────────────
ALTER TABLE app.site_part ADD COLUMN IF NOT EXISTS image_asset_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_part_image_asset_fk') THEN
    ALTER TABLE app.site_part ADD CONSTRAINT site_part_image_asset_fk
      FOREIGN KEY (image_asset_id) REFERENCES app.bom_asset(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN app.site_part.image_asset_id IS
  'Ảnh sản phẩm (bom_asset, file ở UPLOAD_DIR/bom/{full,thumb}). NULL = chưa có ảnh.';

-- Role ứng dụng đọc bom_asset (đã GRANT ở 0083; nhắc lại cho chắc).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hethong_app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.bom_asset TO hethong_app_rw;
  END IF;
END $$;

COMMIT;

-- Verify (chỉ đọc)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'shift_output_entry'
      AND column_name IN ('work_start', 'work_end')) AS entry_work_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'site_part' AND column_name = 'image_asset_id') AS part_image_col,
  (SELECT count(*) FROM app.shift_output_entry WHERE work_start IS NULL) AS legacy_rows_untouched;
