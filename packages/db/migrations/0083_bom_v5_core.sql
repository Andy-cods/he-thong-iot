-- =============================================================
-- 0083_bom_v5_core.sql   (BOM V5 / WP1 — cột mới bom_line + lịch sử + kho ảnh)
-- IDEMPOTENT (chạy 2 lần không lỗi). Áp STAGING / bản sao prod trước, rồi prod.
-- Áp TRƯỚC khi deploy code đọc cột mới. KHÔNG xoá cột/metadata cũ.
-- Chạy bằng role owner (hethong_app / staging_app). Thiết kế: plans/bom-v5/design.md 2.1
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

-- NCC thống nhất + khoá phiên bản + cột chuẩn hoá (ALTER ngắn, nên chạy ngoài giờ)
ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS supplier_id        uuid REFERENCES app.supplier(id),
  ADD COLUMN IF NOT EXISTS supplier_pending   text,
  ADD COLUMN IF NOT EXISTS row_version        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS category           text,
  ADD COLUMN IF NOT EXISTS process_method     text,
  ADD COLUMN IF NOT EXISTS surface_treatment  text,
  ADD COLUMN IF NOT EXISTS blank_spec         text,
  ADD COLUMN IF NOT EXISTS material_code      text,
  ADD COLUMN IF NOT EXISTS file3d_name        text,
  ADD COLUMN IF NOT EXISTS image_asset_id     uuid,
  ADD COLUMN IF NOT EXISTS coef               numeric(10,4),
  ADD COLUMN IF NOT EXISTS pic_names          text[];

CREATE INDEX IF NOT EXISTS bom_line_supplier_idx ON app.bom_line (supplier_id);

COMMENT ON COLUMN app.bom_line.supplier_id IS 'V5 — NCC chuẩn (FK app.supplier). Đọc qua resolveLineSupplier (fallback metadata cũ).';
COMMENT ON COLUMN app.bom_line.supplier_pending IS 'V5 — text NCC chưa chốt (vd "Tân Tiến/Phạm Gia"); supplier_id NULL.';
COMMENT ON COLUMN app.bom_line.row_version IS 'V5 — khoá phiên bản lạc quan; tăng khi sửa trường dòng (không tăng khi stage-move).';
COMMENT ON COLUMN app.bom_line.category IS 'V5 — GTAM | OUTSOURCED | COMMERCIAL (thay metadata.category).';

-- Cờ NCC tạo từ BOM, chờ rà soát (ai xem BOM cũng được tạo NCC)
ALTER TABLE app.supplier
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN app.supplier.needs_review IS 'V5 — NCC tạo nhanh từ BOM, chờ rà soát/bổ sung thông tin.';

-- Lịch sử đổi trường dòng BOM (NCC, SL...)
CREATE TABLE IF NOT EXISTS app.bom_line_change (
  id          bigserial PRIMARY KEY,
  line_id     uuid NOT NULL REFERENCES app.bom_line(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  field       text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  actor_id    uuid,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bom_line_change_line_idx ON app.bom_line_change (line_id, at DESC);

-- Kho ảnh (dedup theo sha256)
CREATE TABLE IF NOT EXISTS app.bom_asset (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256      char(64) NOT NULL,
  mime        text NOT NULL,
  width       integer,
  height      integer,
  path_full   text NOT NULL,
  path_thumb  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bom_asset_sha256_uk ON app.bom_asset (sha256);

-- Quyền cho role DML-only (chỉ khi role tồn tại)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hethong_app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.bom_line_change, app.bom_asset TO hethong_app_rw;
    GRANT USAGE, SELECT ON SEQUENCE app.bom_line_change_id_seq TO hethong_app_rw;
  END IF;
END $$;

COMMIT;
