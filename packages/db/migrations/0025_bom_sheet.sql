-- ============================================================================
-- V2.0 Phase 2 Sprint 6 — Migration 0025
--   bom_sheet: 1 BOM List có thể có nhiều sheets (PROJECT/MATERIAL_REF/PROCESS_REF/CUSTOM)
-- ----------------------------------------------------------------------------
-- Bối cảnh: file Excel "Bản chính thức" 1 file = 1 BOM List với 3 sheets:
--   - Sheet 1+2: BOM project (R01 + L01) — kind=PROJECT, link bom_lines qua sheet_id
--   - Sheet 3: Material&Process — kind=MATERIAL_REF / PROCESS_REF, reference
--     master_master toàn cục qua metadata
-- User có thể add sheet mới (CUSTOM) vào BOM List hiện có khi phát sinh module phụ.
--
-- Phương án D Hybrid (theo plans/redesign-v3/sprint-6-multi-sheet-brainstorm.md §3):
-- giữ nguyên bom_template + thêm bom_sheet table. Sheet PROJECT vẫn link tới
-- bom_lines (qua sheet_id thêm ở migration 0026); sheet MATERIAL_REF/PROCESS_REF
-- chỉ chứa metadata (filter/sắp xếp) — data thật ở material_master + process_master.
--
-- User: hethong_app. Idempotent: IF NOT EXISTS + DO $$ check enum exists.
-- Refs: plans/redesign-v3/sprint-6-multi-sheet-brainstorm.md §5.1
-- ============================================================================

SET search_path TO app, public;

-- ---------------------------------------------------------------------------
-- Enum bom_sheet_kind — loại sheet trong 1 BOM List
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bom_sheet_kind') THEN
    CREATE TYPE app.bom_sheet_kind AS ENUM (
      'PROJECT',       -- Sheet chứa bom_lines (cấu trúc sản phẩm)
      'MATERIAL_REF',  -- Reference master vật liệu — chỉ metadata filter, data ở material_master
      'PROCESS_REF',   -- Reference master quy trình
      'CUSTOM'         -- Sheet tự do (note, hướng dẫn, đặc tả khách)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Bảng bom_sheet
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.bom_sheet (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES app.bom_template(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  kind         app.bom_sheet_kind NOT NULL DEFAULT 'PROJECT',
  position     INT NOT NULL DEFAULT 1,
  /**
   * metadata jsonb — chứa context per-kind:
   *   - PROJECT: { sourceSheetName: "Z0000002-502653 BOM triển khai",
   *                titleRow: "Z0000002-502653_BANG TAI DIPPING R01" }
   *   - MATERIAL_REF: { filterCategories?: ["ALUMINIUM", "STAINLESS_STEEL"],
   *                     usedMaterialCodes?: ["AL6061","SUS304_20_40"] }
   *   - PROCESS_REF: { filterUnits?: ["HOUR","CM2"], usedProcessCodes?: [...] }
   *   - CUSTOM: { content: "markdown text", attachments: [...] }
   */
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

-- Index cho query "tất cả sheet của 1 BOM, sắp theo position"
CREATE INDEX IF NOT EXISTS bom_sheet_template_pos_idx
  ON app.bom_sheet (template_id, position);

CREATE INDEX IF NOT EXISTS bom_sheet_kind_idx
  ON app.bom_sheet (kind);

-- Unique tên sheet trong cùng BOM (tránh trùng "Sheet 1" + "Sheet 1")
CREATE UNIQUE INDEX IF NOT EXISTS bom_sheet_template_name_uk
  ON app.bom_sheet (template_id, name);

-- ---------------------------------------------------------------------------
-- Trigger updated_at (reuse function tg_touch_updated_at từ migration cũ)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_touch_updated_at') THEN
    DROP TRIGGER IF EXISTS tg_bom_sheet_touch ON app.bom_sheet;
    CREATE TRIGGER tg_bom_sheet_touch
      BEFORE UPDATE ON app.bom_sheet
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
  END IF;
END $$;

COMMENT ON TABLE app.bom_sheet IS
  'V2.0 Sprint 6 — sheets bên trong 1 BOM List (PROJECT lines / MATERIAL_REF / PROCESS_REF / CUSTOM). 1 BOM = 1+ sheets.';
COMMENT ON COLUMN app.bom_sheet.kind IS
  'PROJECT = sheet chứa bom_lines (cấu trúc sản phẩm). MATERIAL_REF/PROCESS_REF = reference master toàn cục. CUSTOM = sheet free-form.';

-- Verify
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM app.bom_sheet;
  RAISE NOTICE '[0025] bom_sheet table created, current rows=%', v_count;
END $$;
