-- V4.0 Wave 3 Phase D — Phiếu giao hàng / Biên bản giao hàng (BBGH).
--
-- Thiết kế: plans/v4-finance/bbgh-form-design.md (duyệt theo U-4). 2 bảng mới
-- hoàn toàn (KHÔNG dùng drizzle-kit push trên prod — theo DRIFT-NOTES.md mục 4,
-- các bảng tạo SAU baseline ban đầu đều tạo bằng SQL migration idempotent,
-- giống cách 0055a_finance_tables.sql đã làm cho phân hệ Tài chính).
--
-- Quan hệ 1–1 với warehouse_issue_request (UNIQUE issue_request_id) — 1 issue
-- request COMPLETED sinh tối đa 1 delivery note. "Phiếu giao hàng" (DRAFT/
-- PENDING_APPROVAL) và "BBGH" (CONFIRMED) là CÙNG 1 bảng, khác status.

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.delivery_note (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_no                 VARCHAR(32)  NOT NULL,
  status                  VARCHAR(24)  NOT NULL DEFAULT 'DRAFT',

  issue_request_id        UUID NOT NULL REFERENCES app.warehouse_issue_request(id),
  sales_order_id          UUID REFERENCES app.sales_order(id),
  po_id                   UUID REFERENCES app.purchase_order(id),

  recipient_name          VARCHAR(255) NOT NULL,
  recipient_address       TEXT,
  recipient_contact_name  VARCHAR(128),
  recipient_phone         VARCHAR(32),

  contract_no             VARCHAR(64),

  vehicle_type            VARCHAR(64),
  vehicle_plate           VARCHAR(32),
  carrier_name            VARCHAR(128),
  carrier_phone           VARCHAR(32),

  delivery_result         VARCHAR(16) NOT NULL DEFAULT 'FULL'
                            CHECK (delivery_result IN ('FULL','SHORT','DAMAGED')),
  conclusion_notes        TEXT,

  delivered_by            UUID NOT NULL REFERENCES app.user_account(id),

  confirmed_by            UUID REFERENCES app.user_account(id),
  confirmed_at            TIMESTAMPTZ,
  rejected_by             UUID REFERENCES app.user_account(id),
  rejected_at             TIMESTAMPTZ,
  rejection_reason        TEXT,

  notes                   TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES app.user_account(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_note_no_uk
  ON app.delivery_note (note_no);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_note_issue_request_uk
  ON app.delivery_note (issue_request_id);
CREATE INDEX IF NOT EXISTS delivery_note_status_idx
  ON app.delivery_note (status, created_at);

COMMENT ON TABLE app.delivery_note IS
  'BBGH — Biên bản Giao hàng. DRAFT/PENDING_APPROVAL = Phiếu giao hàng chưa ký; CONFIRMED = BBGH chính thức (Giám đốc đã duyệt).';

CREATE TABLE IF NOT EXISTS app.delivery_note_line (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id    UUID NOT NULL REFERENCES app.delivery_note(id) ON DELETE CASCADE,
  line_no             INTEGER NOT NULL,
  item_id             UUID NOT NULL REFERENCES app.item(id),
  specification       VARCHAR(256),
  uom                 VARCHAR(32),
  doc_qty             NUMERIC(18,4) NOT NULL CHECK (doc_qty >= 0),
  actual_qty          NUMERIC(18,4) NOT NULL CHECK (actual_qty >= 0),
  condition           VARCHAR(16) NOT NULL DEFAULT 'FULL'
                        CHECK (condition IN ('FULL','SHORT','DAMAGED')),
  notes               TEXT,
  CONSTRAINT delivery_note_line_uk UNIQUE (delivery_note_id, line_no)
);

CREATE INDEX IF NOT EXISTS delivery_note_line_note_idx
  ON app.delivery_note_line (delivery_note_id);
CREATE INDEX IF NOT EXISTS delivery_note_line_item_idx
  ON app.delivery_note_line (item_id);
