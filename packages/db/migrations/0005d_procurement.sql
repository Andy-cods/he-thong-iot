-- =============================================================
-- Migration 0005d · Procurement PR + PO + lot_status (V1.2)
-- =============================================================
-- Scope:
--   1) CREATE TABLE app.purchase_request (header)
--   2) CREATE TABLE app.purchase_request_line
--   3) ALTER app.purchase_order add pr_id FK (nullable cho manual PO)
--   4) ALTER app.inventory_lot_serial add status enum (HOLD/AVAILABLE...)
--   5) Sequence sinh pr_code `PR-YYMM-####`
-- =============================================================

-- 1) app.purchase_request
CREATE TABLE IF NOT EXISTS app.purchase_request (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code             varchar(32)  NOT NULL UNIQUE,
  title            varchar(255),
  status           app.purchase_request_status NOT NULL DEFAULT 'DRAFT',
  source           varchar(16)  NOT NULL DEFAULT 'MANUAL'
                    CHECK (source IN ('SHORTAGE', 'MANUAL')),
  linked_order_id  uuid         REFERENCES app.sales_order(id),
  requested_by     uuid         REFERENCES app.user_account(id),
  approved_by      uuid         REFERENCES app.user_account(id),
  approved_at      timestamptz,
  notes            text,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- 2) app.purchase_request_line
CREATE TABLE IF NOT EXISTS app.purchase_request_line (
  id                        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id                     uuid         NOT NULL REFERENCES app.purchase_request(id) ON DELETE CASCADE,
  line_no                   integer      NOT NULL,
  item_id                   uuid         NOT NULL REFERENCES app.item(id),
  qty                       numeric(18,6) NOT NULL CHECK (qty > 0),
  preferred_supplier_id     uuid         REFERENCES app.supplier(id),
  snapshot_line_id          uuid         REFERENCES app.bom_snapshot_line(id),
  needed_by                 date,
  notes                     text,
  CONSTRAINT pr_line_uk UNIQUE (pr_id, line_no)
);

-- 3) Sequence PR code
CREATE SEQUENCE IF NOT EXISTS app.purchase_request_no_seq
  START 1 INCREMENT 1 MINVALUE 1 NO MAXVALUE CACHE 1;

CREATE OR REPLACE FUNCTION app.gen_pr_code()
RETURNS varchar
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
  v_yymm text;
BEGIN
  v_next := nextval('app.purchase_request_no_seq');
  v_yymm := to_char(now(), 'YYMM');
  RETURN 'PR-' || v_yymm || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- 4) ALTER purchase_order — thêm pr_id FK (nullable - support manual PO)
ALTER TABLE app.purchase_order
  ADD COLUMN IF NOT EXISTS pr_id uuid REFERENCES app.purchase_request(id);

-- 5) ALTER purchase_order_line — thêm snapshot_line_id để trace shortage
ALTER TABLE app.purchase_order_line
  ADD COLUMN IF NOT EXISTS snapshot_line_id uuid REFERENCES app.bom_snapshot_line(id);

-- 6) ALTER inventory_lot_serial — thêm status enum + hold_reason
ALTER TABLE app.inventory_lot_serial
  ADD COLUMN IF NOT EXISTS status app.lot_status NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE app.inventory_lot_serial
  ADD COLUMN IF NOT EXISTS hold_reason text;

-- Verify
DO $$
DECLARE pr_cols integer; prl_cols integer; po_has_pr boolean; lot_has_status boolean;
BEGIN
  SELECT count(*) INTO pr_cols FROM information_schema.columns
    WHERE table_schema='app' AND table_name='purchase_request';
  SELECT count(*) INTO prl_cols FROM information_schema.columns
    WHERE table_schema='app' AND table_name='purchase_request_line';
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='app' AND table_name='purchase_order' AND column_name='pr_id')
    INTO po_has_pr;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='app' AND table_name='inventory_lot_serial' AND column_name='status')
    INTO lot_has_status;
  IF pr_cols < 10 OR prl_cols < 8 OR NOT po_has_pr OR NOT lot_has_status THEN
    RAISE EXCEPTION 'procurement migration incomplete (pr=%, prl=%, po_has_pr=%, lot_has_status=%)',
      pr_cols, prl_cols, po_has_pr, lot_has_status;
  END IF;
  RAISE NOTICE 'migration 0005d: purchase_request/line + po.pr_id + lot_serial.status OK';
END $$;
