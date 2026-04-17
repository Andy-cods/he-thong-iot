-- =============================================================
-- Migration 0003b · V1.1-alpha · BOM tables + receiving_event (APP USER)
-- =============================================================
-- Chạy bằng `hethong_app`.
-- Yêu cầu: 0003a_bom_enums.sql đã apply (enum app.bom_status tồn tại).
--
-- Apply:
--   docker cp packages/db/migrations/0003b_bom_tables.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/0003b_bom_tables.sql
--
-- Schema V1.1-alpha khác V1 cũ:
--   - Bỏ bảng `bom_revision` (defer V1.1-full).
--   - `bom_line` self-ref tree (`parent_line_id`) thay flat parent/child.
-- =============================================================

-- 1) bom_template -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.bom_template (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            varchar(64) NOT NULL,
  name            varchar(255) NOT NULL,
  description     text,
  parent_item_id  uuid        REFERENCES app.item(id) ON DELETE SET NULL,
  target_qty      numeric(18,6) NOT NULL DEFAULT 1,
  status          app.bom_status NOT NULL DEFAULT 'DRAFT',
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES app.user_account(id),
  CONSTRAINT bom_template_code_uk UNIQUE (code),
  CONSTRAINT bom_template_target_qty_chk CHECK (target_qty > 0)
);

-- 2) bom_line (self-ref tree, level 1..5) ----------------------------------
CREATE TABLE IF NOT EXISTS app.bom_line (
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

-- Self-ref FK (cascade delete — xoá parent → xoá tất cả descendant)
DO $$ BEGIN
  ALTER TABLE app.bom_line
    ADD CONSTRAINT bom_line_parent_fk
    FOREIGN KEY (parent_line_id) REFERENCES app.bom_line(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) receiving_event -------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.receiving_event (
  id              uuid        PRIMARY KEY,
  scan_id         uuid        NOT NULL,
  po_code         varchar(64) NOT NULL,
  sku             varchar(128) NOT NULL,
  qty             numeric(18,6) NOT NULL,
  lot_no          varchar(128),
  qc_status       varchar(16) NOT NULL DEFAULT 'PENDING',
  scanned_at      timestamptz NOT NULL,
  received_by     uuid        REFERENCES app.user_account(id),
  received_at     timestamptz NOT NULL DEFAULT now(),
  raw_code        varchar(256),
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT receiving_event_qc_status_chk CHECK (qc_status IN ('OK','NG','PENDING')),
  CONSTRAINT receiving_event_qty_chk CHECK (qty > 0),
  CONSTRAINT receiving_event_scan_id_uk UNIQUE (scan_id)
);

-- Notify success
DO $$ BEGIN
  RAISE NOTICE 'migration 0003b: bom_template + bom_line + receiving_event ready';
END $$;
