-- ============================================================================
-- V2.0 Phase 2 Sprint 6 — Migration 0026
--   bom_line.sheet_id: link mỗi line tới sheet chứa nó (NULLABLE ban đầu)
-- ----------------------------------------------------------------------------
-- Sau migration 0025 tạo bom_sheet, mỗi bom_line cần biết thuộc sheet nào.
-- Migration 0027 sẽ backfill data + SET NOT NULL.
--
-- CHECK constraint: parent_line_id phải cùng sheet_id (cấm cross-sheet tree).
-- Implement qua trigger BEFORE INSERT/UPDATE thay vì CHECK constraint thuần
-- (vì cần subquery tới chính bảng bom_line).
--
-- User: hethong_app. Idempotent: IF NOT EXISTS + IF EXISTS guards.
-- Refs: plans/redesign-v3/sprint-6-multi-sheet-brainstorm.md §5.2
-- ============================================================================

SET search_path TO app, public;

-- Add column nullable
ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS sheet_id UUID REFERENCES app.bom_sheet(id) ON DELETE CASCADE;

-- Index hỗ trợ "lấy tất cả lines của 1 sheet, sắp theo position"
CREATE INDEX IF NOT EXISTS bom_line_sheet_idx
  ON app.bom_line (sheet_id, position)
  WHERE sheet_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Trigger enforce parent_line_id phải cùng sheet_id (no cross-sheet tree)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.bom_line_check_parent_sheet()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_sheet_id UUID;
BEGIN
  IF NEW.parent_line_id IS NOT NULL AND NEW.sheet_id IS NOT NULL THEN
    SELECT sheet_id INTO v_parent_sheet_id
    FROM app.bom_line
    WHERE id = NEW.parent_line_id;

    IF v_parent_sheet_id IS DISTINCT FROM NEW.sheet_id THEN
      RAISE EXCEPTION
        'parent_line_id (sheet=%) phải cùng sheet_id (=%) — cross-sheet tree không hợp lệ',
        v_parent_sheet_id, NEW.sheet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bom_line_check_parent_sheet_trg ON app.bom_line;
CREATE TRIGGER bom_line_check_parent_sheet_trg
  BEFORE INSERT OR UPDATE OF parent_line_id, sheet_id ON app.bom_line
  FOR EACH ROW EXECUTE FUNCTION app.bom_line_check_parent_sheet();

COMMENT ON COLUMN app.bom_line.sheet_id IS
  'V2.0 Sprint 6 — FK tới bom_sheet. Migration 0027 sẽ backfill + SET NOT NULL. Trigger bom_line_check_parent_sheet_trg đảm bảo cha cùng sheet.';

-- Verify
DO $$
DECLARE v_total INT; v_with_sheet INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM app.bom_line;
  SELECT COUNT(*) INTO v_with_sheet FROM app.bom_line WHERE sheet_id IS NOT NULL;
  RAISE NOTICE '[0026] bom_line total=%, with_sheet_id=% (rest backfill ở 0027)', v_total, v_with_sheet;
END $$;
