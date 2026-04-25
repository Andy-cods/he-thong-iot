-- ============================================================================
-- V2.0 Phase 2 Sprint 6 — Migration 0027
--   Backfill bom_sheet cho BOM cũ + SET NOT NULL bom_line.sheet_id
-- ----------------------------------------------------------------------------
-- BOM cũ (trước Sprint 6) có 1 template = lines flat (no sheet concept).
-- Backfill: tạo 1 sheet PROJECT default cho mỗi template, link tất cả lines
-- của template vào sheet đó.
--
-- Sau backfill verify zero null → ALTER COLUMN SET NOT NULL.
-- KHÔNG ROLLBACK được — phải pg_dump backup trước khi chạy.
--
-- User: hethong_app. Idempotent: WHERE id NOT IN check.
-- Refs: plans/redesign-v3/sprint-6-multi-sheet-brainstorm.md §5.3
-- ============================================================================

SET search_path TO app, public;

-- ---------------------------------------------------------------------------
-- 1) Tạo 1 sheet PROJECT default cho mỗi template chưa có sheet nào
-- ---------------------------------------------------------------------------
INSERT INTO app.bom_sheet (template_id, name, kind, position, metadata)
SELECT
  t.id,
  'Sheet 1',
  'PROJECT'::app.bom_sheet_kind,
  1,
  jsonb_build_object(
    'backfilledFrom', 'v1-implicit-flat',
    'backfilledAt', now(),
    'sourceTemplateCode', t.code
  )
FROM app.bom_template t
WHERE NOT EXISTS (
  SELECT 1 FROM app.bom_sheet s WHERE s.template_id = t.id
);

-- ---------------------------------------------------------------------------
-- 2) Backfill bom_line.sheet_id cho lines chưa có
-- ---------------------------------------------------------------------------
UPDATE app.bom_line bl
SET sheet_id = bs.id
FROM app.bom_sheet bs
WHERE bs.template_id = bl.template_id
  AND bs.kind = 'PROJECT'
  AND bs.position = 1
  AND bl.sheet_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Verify zero null trước khi SET NOT NULL
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_null_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM app.bom_line WHERE sheet_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION '[0027] Backfill failed: % bom_line rows still have NULL sheet_id. Manual investigation needed.', v_null_count;
  END IF;
  RAISE NOTICE '[0027] All bom_line rows have sheet_id. Setting NOT NULL.';
END $$;

-- ---------------------------------------------------------------------------
-- 4) SET NOT NULL — sau migration này, mọi insert mới phải có sheet_id
-- ---------------------------------------------------------------------------
ALTER TABLE app.bom_line ALTER COLUMN sheet_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Verify final state
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_templates INT;
  v_sheets INT;
  v_lines INT;
BEGIN
  SELECT COUNT(*) INTO v_templates FROM app.bom_template;
  SELECT COUNT(*) INTO v_sheets FROM app.bom_sheet;
  SELECT COUNT(*) INTO v_lines FROM app.bom_line;
  RAISE NOTICE '[0027] templates=%, sheets=%, lines=% (all with sheet_id)',
    v_templates, v_sheets, v_lines;
END $$;
