-- =============================================================
-- Migration 0003b2 · DROP V1 BOM tables + recreate V1.1-alpha
-- =============================================================
-- Reason: V1 foundation `bomRevision` + `bomLine (parent_item_id, child_item_id)`
-- flat model đã tồn tại. Migration 0003b dùng IF NOT EXISTS → skip create mới →
-- FK parent_line_id add fail. Fix: DROP CASCADE old V1 tables (chưa có data
-- production), recreate V1.1-alpha tree structure.
-- Run: docker exec -i iot_postgres psql -U hethong_app < 0003b2_bom_drop_v1_recreate.sql
-- =============================================================

-- 1) DROP V1 tables (an toàn — không có BOM data production)
DROP TABLE IF EXISTS app.bom_line CASCADE;
DROP TABLE IF EXISTS app.bom_revision CASCADE;

-- 2) CREATE bom_line V1.1-alpha (self-ref tree)
CREATE TABLE app.bom_line (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid         NOT NULL REFERENCES app.bom_template(id) ON DELETE CASCADE,
  parent_line_id      uuid,
  component_item_id   uuid         NOT NULL REFERENCES app.item(id),
  level               integer      NOT NULL DEFAULT 1,
  position            integer      NOT NULL DEFAULT 1,
  qty_per_parent      numeric(18,6) NOT NULL DEFAULT 1,
  scrap_percent       numeric(6,3)  NOT NULL DEFAULT 0,
  uom                 varchar(32),
  description         text,
  supplier_item_code  varchar(128),
  metadata            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT bom_line_level_chk CHECK (level BETWEEN 1 AND 5),
  CONSTRAINT bom_line_qty_chk CHECK (qty_per_parent > 0),
  CONSTRAINT bom_line_scrap_chk CHECK (scrap_percent >= 0 AND scrap_percent <= 100)
);

-- 3) Self-ref FK cascade
ALTER TABLE app.bom_line
  ADD CONSTRAINT bom_line_parent_fk
  FOREIGN KEY (parent_line_id) REFERENCES app.bom_line(id) ON DELETE CASCADE;

-- 4) Recreate indexes đầy đủ (0003c đã chạy partial nhưng thiếu index trên bom_line)
CREATE INDEX IF NOT EXISTS bom_line_template_idx ON app.bom_line (template_id, parent_line_id, position);
CREATE INDEX IF NOT EXISTS bom_line_component_idx ON app.bom_line (component_item_id);
CREATE INDEX IF NOT EXISTS bom_line_desc_trgm_idx ON app.bom_line USING GIN (public.f_unaccent(description) gin_trgm_ops) WHERE description IS NOT NULL;

-- 5) Trigger touch updated_at (ensure existing function reuse)
DROP TRIGGER IF EXISTS bom_line_touch ON app.bom_line;
CREATE TRIGGER bom_line_touch
  BEFORE UPDATE ON app.bom_line
  FOR EACH ROW EXECUTE FUNCTION app.tg_touch_updated_at();

-- Verify
DO $$
DECLARE
  total_idx integer;
BEGIN
  SELECT count(*) INTO total_idx FROM pg_indexes WHERE schemaname='app' AND tablename IN ('bom_template','bom_line','receiving_event');
  RAISE NOTICE 'migration 0003b2: bom_line recreated + % indexes on BOM tables', total_idx;
END $$;
