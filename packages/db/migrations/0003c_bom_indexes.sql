-- =============================================================
-- Migration 0003c · V1.1-alpha · BOM indexes + trigger (APP USER)
-- =============================================================
-- Chạy bằng `hethong_app`.
-- Yêu cầu: 0003b_bom_tables.sql + 0002c_gin_unaccent_fix.sql đã apply
-- (public.f_unaccent wrapper IMMUTABLE đã tồn tại).
-- =============================================================

-- bom_template ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bom_template_status_idx
  ON app.bom_template (status);

CREATE INDEX IF NOT EXISTS bom_template_parent_item_idx
  ON app.bom_template (parent_item_id)
  WHERE parent_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bom_template_updated_idx
  ON app.bom_template (updated_at DESC);

-- GIN trgm cho code + name (dùng f_unaccent wrapper IMMUTABLE từ 0002c)
CREATE INDEX IF NOT EXISTS bom_template_code_trgm_idx
  ON app.bom_template USING GIN (code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS bom_template_name_trgm_idx
  ON app.bom_template USING GIN (public.f_unaccent(name) gin_trgm_ops);

-- bom_line -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bom_line_template_level_seq_idx
  ON app.bom_line (template_id, level, position);

CREATE INDEX IF NOT EXISTS bom_line_parent_idx
  ON app.bom_line (parent_line_id)
  WHERE parent_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bom_line_component_idx
  ON app.bom_line (component_item_id);

-- GIN trgm cho description search (tùy chọn, partial WHERE NOT NULL)
CREATE INDEX IF NOT EXISTS bom_line_description_trgm_idx
  ON app.bom_line USING GIN (public.f_unaccent(description) gin_trgm_ops)
  WHERE description IS NOT NULL;

-- Unique: cùng parent không có 2 position trùng (NULL parent treat as root bucket)
CREATE UNIQUE INDEX IF NOT EXISTS bom_line_parent_position_uk
  ON app.bom_line (
    template_id,
    COALESCE(parent_line_id, '00000000-0000-0000-0000-000000000000'::uuid),
    position
  );

-- Trigger updated_at ---------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_touch_updated_at()
  RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bom_template_touch ON app.bom_template;
CREATE TRIGGER bom_template_touch
  BEFORE UPDATE ON app.bom_template
  FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

DROP TRIGGER IF EXISTS bom_line_touch ON app.bom_line;
CREATE TRIGGER bom_line_touch
  BEFORE UPDATE ON app.bom_line
  FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

-- receiving_event ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS receiving_event_po_idx
  ON app.receiving_event (po_code, scanned_at DESC);

CREATE INDEX IF NOT EXISTS receiving_event_user_idx
  ON app.receiving_event (received_by, scanned_at DESC)
  WHERE received_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS receiving_event_sku_idx
  ON app.receiving_event (sku);

-- Verify
DO $$
DECLARE
  idx_count int;
BEGIN
  SELECT count(*) INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'app'
    AND indexname IN (
      'bom_template_status_idx','bom_template_name_trgm_idx','bom_template_code_trgm_idx',
      'bom_line_template_level_seq_idx','bom_line_component_idx',
      'receiving_event_po_idx','receiving_event_sku_idx'
    );
  IF idx_count < 7 THEN
    RAISE WARNING 'BOM indexes chưa đầy đủ — expected 7+, got %', idx_count;
  ELSE
    RAISE NOTICE 'migration 0003c: indexes OK (%)', idx_count;
  END IF;
END $$;
