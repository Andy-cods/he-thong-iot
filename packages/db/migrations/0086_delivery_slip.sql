-- =============================================================
-- 0086_delivery_slip.sql   (BOM V5 / WP1 — Phiếu giao nội bộ/NTP; KHÔNG đụng delivery_note)
-- IDEMPOTENT. Phụ thuộc 0083. Số phiếu: GT-PG{yymmdd}-0{n}, n theo ngày (delivery_slip_seq).
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.delivery_slip (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_no        varchar(32) NOT NULL,
  kind           text NOT NULL,
  template_id    uuid NOT NULL REFERENCES app.bom_template(id),
  project_code   text,
  supplier_id    uuid REFERENCES app.supplier(id),
  recipient_text text,
  status         text NOT NULL DEFAULT 'SENT',
  batch_no       integer NOT NULL DEFAULT 1,
  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_slip_no_uk ON app.delivery_slip (slip_no);
CREATE INDEX IF NOT EXISTS delivery_slip_template_idx ON app.delivery_slip (template_id, kind);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_slip_kind_chk'
                 AND conrelid = 'app.delivery_slip'::regclass) THEN
    ALTER TABLE app.delivery_slip ADD CONSTRAINT delivery_slip_kind_chk
      CHECK (kind IN ('SURFACE','ASSEMBLY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_slip_status_chk'
                 AND conrelid = 'app.delivery_slip'::regclass) THEN
    ALTER TABLE app.delivery_slip ADD CONSTRAINT delivery_slip_status_chk
      CHECK (status IN ('SENT','PARTIAL_RECEIVED','RECEIVED','CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_slip_surface_supplier_chk'
                 AND conrelid = 'app.delivery_slip'::regclass) THEN
    ALTER TABLE app.delivery_slip ADD CONSTRAINT delivery_slip_surface_supplier_chk
      CHECK (kind <> 'SURFACE' OR supplier_id IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.delivery_slip_line (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id      uuid NOT NULL REFERENCES app.delivery_slip(id) ON DELETE CASCADE,
  line_id      uuid NOT NULL REFERENCES app.bom_line(id),
  stt          integer NOT NULL,
  from_stage   text NOT NULL,
  to_stage     text NOT NULL,
  qty_doc      numeric(18,4) NOT NULL,
  qty_received numeric(18,4) NOT NULL DEFAULT 0,
  unit_price   numeric(18,2),
  note         text,
  snap         jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS delivery_slip_line_slip_idx ON app.delivery_slip_line (slip_id);
CREATE INDEX IF NOT EXISTS delivery_slip_line_line_idx ON app.delivery_slip_line (line_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_slip_line_qty_doc_chk'
                 AND conrelid = 'app.delivery_slip_line'::regclass) THEN
    ALTER TABLE app.delivery_slip_line ADD CONSTRAINT delivery_slip_line_qty_doc_chk CHECK (qty_doc > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_slip_line_qty_recv_chk'
                 AND conrelid = 'app.delivery_slip_line'::regclass) THEN
    ALTER TABLE app.delivery_slip_line ADD CONSTRAINT delivery_slip_line_qty_recv_chk
      CHECK (qty_received >= 0);
  END IF;
END $$;

-- Sequence theo ngày (app tính `day` theo Asia/Ho_Chi_Minh):
--   INSERT INTO app.delivery_slip_seq(day,last) VALUES ($1,1)
--   ON CONFLICT (day) DO UPDATE SET last = delivery_slip_seq.last + 1 RETURNING last;
-- slip_no = 'GT-PG' || to_char(day,'YYMMDD') || '-0' || last
CREATE TABLE IF NOT EXISTS app.delivery_slip_seq (
  day  date PRIMARY KEY,
  last integer NOT NULL
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hethong_app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON app.delivery_slip, app.delivery_slip_line, app.delivery_slip_seq TO hethong_app_rw;
  END IF;
END $$;

COMMIT;
