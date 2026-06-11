-- V3.8 — Bảng điều hành sản xuất (Production Board) + role 'qc'
-- Màn hình kiểu "bảng chờ chuyến bay" chiếu TV xưởng. Tổ QC nhập tay.
-- 1. Thêm role 'qc' vào enum role_code + seed role row
-- 2. Enum production_board_status
-- 3. Bảng production_board_item + production_board_history
-- 4. Trigger auto-history (đổi status/qty_done) + set completed_at

-- ════════════════════════════════════════════════════════════════════
-- 1. Role 'qc' (Tổ KCS/QC)
-- ════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'qc'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
  ) THEN
    ALTER TYPE role_code ADD VALUE 'qc';
  END IF;
END $$;

INSERT INTO app.role (code, display_name, description)
VALUES ('qc', 'Tổ QC / KCS', 'Kiểm tra chất lượng + quản lý Bảng điều hành sản xuất (production board)')
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 2. Enum trạng thái board
-- ════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_board_status') THEN
    CREATE TYPE production_board_status AS ENUM
      ('QUEUED', 'IN_PROGRESS', 'QC', 'COMPLETED', 'DELIVERED');
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 3. Bảng production_board_item
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.production_board_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           INTEGER NOT NULL DEFAULT 0,
  product_code  VARCHAR(128) NOT NULL,
  rfq_no        VARCHAR(64),
  product_name  TEXT NOT NULL,
  customer      VARCHAR(64),
  qty_planned   NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty_done      NUMERIC(14,2) NOT NULL DEFAULT 0,
  uom           VARCHAR(24) DEFAULT 'Pcs',
  status        production_board_status NOT NULL DEFAULT 'QUEUED',
  deadline      DATE,
  current_stage VARCHAR(128),
  notes         TEXT,
  is_pinned     BOOLEAN NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS production_board_status_idx ON app.production_board_item (status);
CREATE INDEX IF NOT EXISTS production_board_seq_idx ON app.production_board_item (seq);
CREATE INDEX IF NOT EXISTS production_board_code_idx ON app.production_board_item (product_code);

-- ════════════════════════════════════════════════════════════════════
-- 4. Bảng production_board_history
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.production_board_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES app.production_board_item(id) ON DELETE CASCADE,
  field       VARCHAR(32) NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS production_board_history_item_idx
  ON app.production_board_history (item_id, changed_at);

-- ════════════════════════════════════════════════════════════════════
-- 5. Trigger: auto set completed_at khi status → COMPLETED, clear khi rời.
--    (Lịch sử thay đổi do app ghi qua repo để gắn changed_by chính xác.)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION app.production_board_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'COMPLETED' AND NEW.status <> 'DELIVERED' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_board_touch_trg ON app.production_board_item;
CREATE TRIGGER production_board_touch_trg
  BEFORE UPDATE ON app.production_board_item
  FOR EACH ROW EXECUTE FUNCTION app.production_board_touch();
