-- =============================================================
-- Migration 0003b3 · DROP V1 bom_template + recreate V1.1-alpha
-- =============================================================
-- V1 foundation bom_template dùng `product_item_id` + `is_active` schema cũ.
-- V1.1-alpha cần `parent_item_id` + `target_qty` + `status` + `metadata` + `updated_at`.
-- Migration 0003b IF NOT EXISTS skip → old table stays → API 500 missing column.
-- Fix: DROP CASCADE (dependent bom_line đã được drop ở 0003b2) + recreate.
-- =============================================================

-- 1) DROP bom_line trước (depends bom_template), rồi bom_template
DROP TABLE IF EXISTS app.bom_line CASCADE;
DROP TABLE IF EXISTS app.bom_template CASCADE;

-- 2) Recreate bom_template V1.1-alpha
CREATE TABLE app.bom_template (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            varchar(64) NOT NULL,
  name            varchar(256) NOT NULL,
  description     text,
  parent_item_id  uuid        REFERENCES app.item(id),
  target_qty      numeric(18,4) NOT NULL DEFAULT 1,
  status          app.bom_status NOT NULL DEFAULT 'DRAFT',
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES app.user_account(id),
  CONSTRAINT bom_template_code_uk UNIQUE (code),
  CONSTRAINT bom_template_target_qty_chk CHECK (target_qty > 0)
);

-- 3) Recreate bom_line V1.1-alpha (self-ref tree)
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

ALTER TABLE app.bom_line
  ADD CONSTRAINT bom_line_parent_fk
  FOREIGN KEY (parent_line_id) REFERENCES app.bom_line(id) ON DELETE CASCADE;

-- 4) Recreate all indexes
CREATE INDEX IF NOT EXISTS bom_template_status_idx ON app.bom_template (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS bom_template_parent_idx ON app.bom_template (parent_item_id);
CREATE INDEX IF NOT EXISTS bom_template_code_trgm_idx ON app.bom_template USING GIN (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS bom_template_name_trgm_idx ON app.bom_template USING GIN (public.f_unaccent(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS bom_line_template_idx ON app.bom_line (template_id, parent_line_id, position);
CREATE INDEX IF NOT EXISTS bom_line_component_idx ON app.bom_line (component_item_id);
CREATE INDEX IF NOT EXISTS bom_line_desc_trgm_idx ON app.bom_line USING GIN (public.f_unaccent(description) gin_trgm_ops) WHERE description IS NOT NULL;

-- Verify
DO $$
DECLARE col_count integer;
BEGIN
  SELECT count(*) INTO col_count FROM information_schema.columns
    WHERE table_schema='app' AND table_name='bom_template' AND column_name IN ('parent_item_id','target_qty','status','metadata','updated_at');
  IF col_count <> 5 THEN
    RAISE EXCEPTION 'bom_template missing V1.1-alpha columns (%/5)', col_count;
  END IF;
  RAISE NOTICE 'migration 0003b3: bom_template + bom_line recreated with V1.1-alpha schema';
END $$;
