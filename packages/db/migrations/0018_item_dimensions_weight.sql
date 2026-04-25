-- ============================================================================
-- V2.0 Phase 2 Sprint 4 — Migration 0018
--   item: thêm dimensions (jsonb) + weight_g + material_code (FK material_master)
-- ----------------------------------------------------------------------------
-- Bối cảnh: file Excel "Bản chính thức" có 3 cột vật lý cần lưu vào item:
--   - Visible Part Size: "601.0 X 21.0 X 20.0" → dimensions {length, width, height, unit}
--   - Sub Category: "SUS304", "AL6061 màu xám bạc" → material_code FK
--   - Weight (g): hiện chưa có trong Excel nhưng sẽ tính từ dimensions×density
--
-- ADD COLUMN không default NOT NULL → instant ở Postgres ≥ 11 (no rewrite).
-- material_code dùng VARCHAR (không UUID FK) — sync với material_master.code,
-- FK enforce qua trigger soft (chấp nhận NULL/legacy data, validate khi save UI).
--
-- User: hethong_app. Idempotent: IF NOT EXISTS.
-- Refs: plans/redesign-v3/{brainstorm.md §5, addendum-user-answers.md §1.3}
-- ============================================================================

SET search_path TO app, public;

ALTER TABLE app.item
  ADD COLUMN IF NOT EXISTS dimensions     jsonb,
  ADD COLUMN IF NOT EXISTS weight_g       numeric(12, 3),
  ADD COLUMN IF NOT EXISTS material_code  varchar(64);

-- FK soft cho material_code → material_master.code (chấp nhận NULL).
-- Dùng FK chuẩn để bảo toàn referential integrity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_material_code_fk'
  ) THEN
    ALTER TABLE app.item
      ADD CONSTRAINT item_material_code_fk
      FOREIGN KEY (material_code)
      REFERENCES app.material_master(code)
      ON UPDATE CASCADE
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Index hỗ trợ filter "tất cả item bằng AL6061" trong Items page.
CREATE INDEX IF NOT EXISTS item_material_code_idx
  ON app.item (material_code)
  WHERE material_code IS NOT NULL;

-- Comment doc cho schema introspection (Drizzle introspect / DBeaver).
COMMENT ON COLUMN app.item.dimensions IS
  'V2.0 — kích thước vật lý jsonb {length, width, height, unit} (mm mặc định).
   Parse từ Excel "Visible Part Size" (vd "601.0 X 21.0 X 20.0").';
COMMENT ON COLUMN app.item.weight_g IS
  'V2.0 — trọng lượng (gram). Có thể tính tự động từ dimensions × material density.';
COMMENT ON COLUMN app.item.material_code IS
  'V2.0 — FK app.material_master(code). NULL nếu item không phải vật liệu (vd assembly, packaging).';

-- ---------------------------------------------------------------------------
-- Verify (debug log).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INT;
  v_with_dim INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM app.item;
  SELECT COUNT(*) INTO v_with_dim FROM app.item WHERE dimensions IS NOT NULL;
  RAISE NOTICE '[0018] item total=%, with_dimensions=%', v_total, v_with_dim;
END $$;
