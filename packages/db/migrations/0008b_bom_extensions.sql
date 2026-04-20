-- ============================================================
-- Migration 0008b: Extend bom_template + bom_line cho Univer Grid + status sync
-- V1.5 BOM Core Redesign — Trụ cột 1 (phần 2)
--
-- User chạy: hethong_app
-- ALTER TABLE ADD COLUMN trên Postgres 16 là lazy (không rewrite), không lock table.
-- ============================================================

SET search_path TO app, public;

-- ---------- bom_template: univer snapshot columns ----------
ALTER TABLE app.bom_template
  ADD COLUMN IF NOT EXISTS univer_snapshot JSONB;

ALTER TABLE app.bom_template
  ADD COLUMN IF NOT EXISTS univer_snapshot_updated_at TIMESTAMPTZ;

ALTER TABLE app.bom_template
  ADD COLUMN IF NOT EXISTS univer_snapshot_updated_by UUID
    REFERENCES app.user_account(id);

COMMENT ON COLUMN app.bom_template.univer_snapshot IS
  'V1.5: JSON snapshot Univer spreadsheet (cell values + styles + merges + conditional formats + formulas). Debounced save 2s từ client.';

-- ---------- bom_line: derived_status columns (Trụ cột 5 prep) ----------
ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS derived_status VARCHAR(32);

ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS derived_status_updated_at TIMESTAMPTZ;

ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS derived_status_source JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS bom_line_derived_status_idx
  ON app.bom_line (template_id, derived_status);

COMMENT ON COLUMN app.bom_line.derived_status IS
  'V1.5 auto-computed từ events: planned|requested|ordered|in_transit|received|in_production|completed|delivered. NULL = chưa bắt đầu.';

COMMENT ON COLUMN app.bom_line.derived_status_source IS
  'V1.5: { "kind": "receiving_event"|"po"|"wo"|"delivery", "ref_id": "<uuid>", "at": "<iso>" } — nguồn gốc của derived_status để tooltip hiển thị.';
