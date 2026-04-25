-- ============================================================================
-- V2.0 Phase 2 Sprint 4 — Migration 0019
--   bom_line: thêm position_code (VARCHAR) + notes (TEXT)
-- ----------------------------------------------------------------------------
-- Bối cảnh: file Excel "Bản chính thức" có cột "ID Number" giá trị "R01"-"R41"
-- (sheet 502653) hoặc "S01"-"S40" (sheet 502654). Hiện schema chỉ có
-- `bom_line.position` integer (1, 2, 3…) — không lưu được prefix "R"/"S".
--
-- Sau migration:
--   - Excel importer V2 (sprint 6) sẽ map ID Number → position_code.
--   - BOM grid hiển thị position_code thay vì position số.
--   - Workspace Engineering có thể tìm/filter theo position_code.
--
-- `notes` field cho phép ghi note free-text per line (Note 1/2/3 từ Excel
-- sẽ concat vào đây ở phase 1; phase 2 mới tách bảng `bom_line_note` audit
-- trail với @mention — migration 0020 sau).
--
-- User: hethong_app. Idempotent: IF NOT EXISTS.
-- Refs: plans/redesign-v3/{brainstorm.md §5, addendum-user-answers.md §1.3}
-- ============================================================================

SET search_path TO app, public;

ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS position_code  varchar(16),
  ADD COLUMN IF NOT EXISTS notes          text;

-- Index hỗ trợ filter "tìm line R03 trong BOM template X".
CREATE INDEX IF NOT EXISTS bom_line_position_code_idx
  ON app.bom_line (template_id, position_code)
  WHERE position_code IS NOT NULL;

COMMENT ON COLUMN app.bom_line.position_code IS
  'V2.0 — chuỗi mã vị trí trong BOM (vd "R01", "S40"). Map từ Excel "ID Number".
   Khác `position` integer — code có thể có prefix theo project.';
COMMENT ON COLUMN app.bom_line.notes IS
  'V2.0 phase 1 — note tự do per line. Phase 2 sẽ thay bằng bảng
   bom_line_note (migration 0020) với audit trail + @mention.';

-- ---------------------------------------------------------------------------
-- Verify (debug log).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total INT;
  v_with_pos INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM app.bom_line;
  SELECT COUNT(*) INTO v_with_pos FROM app.bom_line WHERE position_code IS NOT NULL;
  RAISE NOTICE '[0019] bom_line total=%, with_position_code=%', v_total, v_with_pos;
END $$;
