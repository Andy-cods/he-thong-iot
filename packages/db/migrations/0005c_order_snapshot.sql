-- =============================================================
-- Migration 0005c · Order + BOM Snapshot line (V1.2 core)
-- =============================================================
-- Scope:
--   1) Sequence + function sinh order_no `SO-YYMM-####`
--   2) ALTER sales_order thêm version_lock (optimistic lock)
--   3) CREATE TABLE bom_snapshot_line (core V1.2 - 1 bảng flat với
--      path ltree + 10-state + 9 cột qty + GENERATED remaining_short_qty)
-- =============================================================

-- 1) Sequence sinh order_no
CREATE SEQUENCE IF NOT EXISTS app.sales_order_no_seq
  START 1001 INCREMENT 1 MINVALUE 1001 NO MAXVALUE CACHE 1;

-- 2) Function gen_order_code: format SO-YYMM-#### (4-digit zero-pad)
CREATE OR REPLACE FUNCTION app.gen_order_code()
RETURNS varchar
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
  v_yymm text;
BEGIN
  v_next := nextval('app.sales_order_no_seq');
  v_yymm := to_char(now(), 'YYMM');
  RETURN 'SO-' || v_yymm || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- 3) ALTER sales_order — optimistic lock
ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS version_lock integer NOT NULL DEFAULT 0;

-- 4) CREATE TABLE app.bom_snapshot_line (V1.2 mới — không đụng order_bom_snapshot cũ)
CREATE TABLE IF NOT EXISTS app.bom_snapshot_line (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  uuid          NOT NULL REFERENCES app.sales_order(id) ON DELETE CASCADE,
  revision_id               uuid          NOT NULL REFERENCES app.bom_revision(id),
  parent_snapshot_line_id   uuid,
  level                     integer       NOT NULL CHECK (level BETWEEN 1 AND 5),
  path                      ltree         NOT NULL,
  component_item_id         uuid          NOT NULL REFERENCES app.item(id),
  component_sku             varchar(64)   NOT NULL,
  component_name            varchar(256)  NOT NULL,
  required_qty              numeric(18,6) NOT NULL,
  gross_required_qty        numeric(18,6) NOT NULL,
  open_purchase_qty         numeric(18,6) NOT NULL DEFAULT 0,
  received_qty              numeric(18,6) NOT NULL DEFAULT 0,
  qc_pass_qty               numeric(18,6) NOT NULL DEFAULT 0,
  reserved_qty              numeric(18,6) NOT NULL DEFAULT 0,
  issued_qty                numeric(18,6) NOT NULL DEFAULT 0,
  assembled_qty             numeric(18,6) NOT NULL DEFAULT 0,
  remaining_short_qty       numeric(18,6) GENERATED ALWAYS AS (
    GREATEST(
      0,
      gross_required_qty - qc_pass_qty - reserved_qty - issued_qty - assembled_qty
    )
  ) STORED,
  state                     app.bom_snapshot_line_state NOT NULL DEFAULT 'PLANNED',
  transitioned_at           timestamptz,
  transitioned_by           uuid          REFERENCES app.user_account(id),
  version_lock              integer       NOT NULL DEFAULT 0,
  metadata                  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT bom_snapshot_line_qty_chk CHECK (
    required_qty >= 0
    AND gross_required_qty >= 0
    AND open_purchase_qty >= 0
    AND received_qty >= 0
    AND qc_pass_qty >= 0
    AND reserved_qty >= 0
    AND issued_qty >= 0
    AND assembled_qty >= 0
  )
);

-- Self-ref FK (add sau để tránh forward-reference lỗi khi CREATE TABLE trong cùng statement)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bom_snapshot_line_parent_fk'
  ) THEN
    ALTER TABLE app.bom_snapshot_line
      ADD CONSTRAINT bom_snapshot_line_parent_fk
      FOREIGN KEY (parent_snapshot_line_id) REFERENCES app.bom_snapshot_line(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Verify
DO $$
DECLARE col_count integer;
BEGIN
  SELECT count(*) INTO col_count FROM information_schema.columns
    WHERE table_schema='app' AND table_name='bom_snapshot_line';
  IF col_count < 20 THEN
    RAISE EXCEPTION 'bom_snapshot_line missing columns (%/20+)', col_count;
  END IF;
  RAISE NOTICE 'migration 0005c: sequence/function/sales_order.version_lock/bom_snapshot_line created (% cols)', col_count;
END $$;
