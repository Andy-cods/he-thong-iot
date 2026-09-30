-- V4.3 Việc 2 — Kiểm kê kho (stocktake).
--
-- 3 bảng mới hoàn toàn trong schema app, idempotent (IF NOT EXISTS). Trạng
-- thái dùng VARCHAR + CHECK (KHÔNG pgEnum) — theo đúng quy ước đã chốt ở
-- 0057_delivery_note.sql/0060_goods_issue.sql để tránh ALTER TYPE khi mở rộng
-- và tránh lặp lại sự cố drift enum app.* vs public.* đã ghi ở
-- packages/db/DRIFT-NOTES.md mục 1. User: hethong_app (role có quyền CREATE
-- trên schema app — trên staging là staging_app).
--
-- State machine: DRAFT (đang đếm) -> PENDING_APPROVAL (Kho gửi duyệt)
--   -> APPROVED (Giám đốc/admin chốt, ghi ADJUST_PLUS/MINUS 1 lần trong
--      transaction) | REJECTED (Giám đốc trả lại kèm lý do, quay lại DRAFT)
--   DRAFT -> CANCELLED (huỷ phiên, không ghi điều chỉnh).

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.stocktake_session (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(32)  NOT NULL,
  status           VARCHAR(24)  NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED')),
  scope_note       TEXT,
  snapshot_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT,

  created_by       UUID NOT NULL REFERENCES app.user_account(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  submitted_by     UUID REFERENCES app.user_account(id),
  submitted_at     TIMESTAMPTZ,

  approved_by      UUID REFERENCES app.user_account(id),
  approved_at      TIMESTAMPTZ,

  rejected_by      UUID REFERENCES app.user_account(id),
  rejected_at      TIMESTAMPTZ,
  reject_reason    TEXT,

  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stocktake_session_code_uk
  ON app.stocktake_session (code);
CREATE INDEX IF NOT EXISTS stocktake_session_status_idx
  ON app.stocktake_session (status, created_at);

COMMENT ON TABLE app.stocktake_session IS
  'V4.3 — Phiên kiểm kê kho. Kho tạo + đếm, Giám đốc (admin) duyệt chốt ghi điều chỉnh tồn.';

CREATE TABLE IF NOT EXISTS app.stocktake_session_bin (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES app.stocktake_session(id) ON DELETE CASCADE,
  bin_id      UUID NOT NULL REFERENCES app.location_bin(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS stocktake_session_bin_uk
  ON app.stocktake_session_bin (session_id, bin_id);
CREATE INDEX IF NOT EXISTS stocktake_session_bin_bin_idx
  ON app.stocktake_session_bin (bin_id);

CREATE TABLE IF NOT EXISTS app.stocktake_line (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES app.stocktake_session(id) ON DELETE CASCADE,
  bin_id             UUID NOT NULL REFERENCES app.location_bin(id),
  item_id            UUID NOT NULL REFERENCES app.item(id),
  lot_serial_id      UUID REFERENCES app.inventory_lot_serial(id),
  lot_code_snapshot  VARCHAR(64),

  book_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  counted_qty        NUMERIC(18,4),
  counted_by         UUID REFERENCES app.user_account(id),
  counted_at         TIMESTAMPTZ,
  notes              TEXT,

  adjust_txn_id      UUID REFERENCES app.inventory_txn(id),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stocktake_line_session_idx ON app.stocktake_line (session_id);
CREATE INDEX IF NOT EXISTS stocktake_line_bin_idx ON app.stocktake_line (bin_id);
CREATE INDEX IF NOT EXISTS stocktake_line_item_idx ON app.stocktake_line (item_id);

-- Partial unique: NULL không so trùng trong unique index thường nên tách 2
-- index theo có/không có lô — 1 dòng / (session, bin, item, lô) khi có lô;
-- 1 dòng / (session, bin, item) khi không có lô.
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_line_lot_uk
  ON app.stocktake_line (session_id, bin_id, item_id, lot_serial_id)
  WHERE lot_serial_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_line_nolot_uk
  ON app.stocktake_line (session_id, bin_id, item_id)
  WHERE lot_serial_id IS NULL;

COMMENT ON TABLE app.stocktake_line IS
  'V4.3 — 1 dòng đếm = 1 (ô, vật tư, lô) tại thời điểm chụp tồn sổ sách (snapshot_at của phiên).';
