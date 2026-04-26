-- ============================================================================
-- V2.0 Phase 2 Sprint 6 FIX — Migration 0030
--   bom_sheet_process_row: rows quy trình per-BOM (giờ, đơn giá, trạm)
-- ----------------------------------------------------------------------------
-- Tương tự material_row nhưng cho quy trình gia công. Reference master_process
-- qua soft FK process_code, data per-BOM (hours_estimated, price_per_unit
-- deal, station_code).
--
-- pricing_unit theo process_master.pricing_unit (HOUR / CM2 / OTHER) —
-- Anodizing đặc thù 115đ/cm² vẫn map được.
--
-- Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §3 X1, §5.3
-- ============================================================================

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.bom_sheet_process_row (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id          UUID NOT NULL REFERENCES app.bom_sheet(id) ON DELETE CASCADE,
  /** Soft FK tới process_master.code. */
  process_code      VARCHAR(64),
  /** Override tên nếu khác master. */
  name_override     VARCHAR(255),
  /** Optional link bom_line. */
  component_line_id UUID REFERENCES app.bom_line(id) ON DELETE SET NULL,
  /** Giờ ước tính cho project này (vd R01 cần 18h MCT). */
  hours_estimated   NUMERIC(8,2),
  /** Đơn giá deal project (snapshot từ master). */
  price_per_unit    NUMERIC(18,2),
  /** HOUR / CM2 / OTHER — match pricing_unit của master. */
  pricing_unit      VARCHAR(16) NOT NULL DEFAULT 'HOUR',
  /** Trạm thực hiện (T1, T2, EXTERNAL, OUTSOURCE-X) — text linh hoạt. */
  station_code      VARCHAR(64),
  notes             TEXT,
  position          INT NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS bom_sheet_process_row_sheet_pos_idx
  ON app.bom_sheet_process_row (sheet_id, position);
CREATE INDEX IF NOT EXISTS bom_sheet_process_row_process_code_idx
  ON app.bom_sheet_process_row (process_code)
  WHERE process_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS bom_sheet_process_row_component_line_idx
  ON app.bom_sheet_process_row (component_line_id)
  WHERE component_line_id IS NOT NULL;

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_touch_updated_at') THEN
    DROP TRIGGER IF EXISTS tg_bom_sheet_process_row_touch ON app.bom_sheet_process_row;
    CREATE TRIGGER tg_bom_sheet_process_row_touch
      BEFORE UPDATE ON app.bom_sheet_process_row
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
  END IF;
END $$;

COMMENT ON TABLE app.bom_sheet_process_row IS
  'V2.0 Sprint 6 FIX — rows quy trình per-BOM. Reference process_master qua process_code (soft FK), data per-BOM (hours, price, station).';

-- Verify
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM app.bom_sheet_process_row;
  RAISE NOTICE '[0030] bom_sheet_process_row created, current rows=%', v_count;
END $$;
