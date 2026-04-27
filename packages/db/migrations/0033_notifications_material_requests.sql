-- V3.3 — Notifications + Material Requests + role 'purchaser'
-- TASK: implement cross-department notification flow + material request module
-- 1. Thêm role 'purchaser' vào enum
-- 2. Tạo bảng notification (in-app messages)
-- 3. Tạo bảng material_request + material_request_line (yêu cầu xuất kho)

-- ════════════════════════════════════════════════════════════════════
-- 1. Add role 'purchaser' to role_code enum
-- ════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'purchaser'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
  ) THEN
    ALTER TYPE role_code ADD VALUE 'purchaser';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 2. Insert role row nếu chưa có
-- ════════════════════════════════════════════════════════════════════
INSERT INTO app.role (code, display_name, description)
VALUES ('purchaser', 'Bộ phận Thu mua', 'Phụ trách duyệt PR, tạo PO, theo dõi đặt hàng nhà cung cấp')
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 3. Notification table — in-app message cho cross-department workflow
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.notification (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient: hoặc user cụ thể (recipient_user) hoặc broadcast theo role
  -- Nếu cả 2 đều set → user-specific (ưu tiên).
  recipient_user  UUID REFERENCES app.user_account(id) ON DELETE CASCADE,
  recipient_role  role_code,

  -- Actor: ai gây ra event (NULL nếu system)
  actor_user_id   UUID REFERENCES app.user_account(id) ON DELETE SET NULL,
  actor_username  VARCHAR(64),

  -- Event metadata
  event_type      VARCHAR(64) NOT NULL,
    -- PR_SUBMITTED, PR_APPROVED, PR_REJECTED,
    -- PO_SENT, PO_RECEIVED_PARTIAL, PO_RECEIVED_FULL,
    -- WO_RELEASED, WO_COMPLETED,
    -- MATERIAL_REQUEST_NEW, MATERIAL_REQUEST_READY, MATERIAL_REQUEST_DELIVERED
  entity_type     VARCHAR(32),
  entity_id       UUID,
  entity_code     VARCHAR(64),     -- PR-xxx / PO-xxx / WO-xxx (cho click navigate)

  -- Content
  title           TEXT NOT NULL,
  message         TEXT,
  link            TEXT,            -- /procurement/purchase-requests/[id]
  severity        VARCHAR(16) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'error')),

  -- Read tracking
  read_at         TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Phải có ít nhất 1 recipient
  CONSTRAINT notification_recipient_check CHECK (
    recipient_user IS NOT NULL OR recipient_role IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS notification_recipient_user_idx
  ON app.notification (recipient_user, read_at NULLS FIRST, created_at DESC)
  WHERE recipient_user IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_recipient_role_idx
  ON app.notification (recipient_role, read_at NULLS FIRST, created_at DESC)
  WHERE recipient_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_entity_idx
  ON app.notification (entity_type, entity_id);

-- ════════════════════════════════════════════════════════════════════
-- 4. Material request — yêu cầu xuất kho linh kiện (engineer → warehouse)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.material_request (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no          VARCHAR(64) NOT NULL,

  -- Yêu cầu cho việc gì (link tuỳ chọn)
  bom_template_id     UUID REFERENCES app.bom_template(id) ON DELETE SET NULL,
  wo_id               UUID REFERENCES app.work_order(id) ON DELETE SET NULL,

  -- Workflow
  status              VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PICKING', 'READY', 'DELIVERED', 'CANCELLED')),
  -- PENDING   : engineer mới tạo, chờ kho xác nhận
  -- PICKING   : warehouse đang chuẩn bị
  -- READY     : warehouse đã chuẩn bị xong, chờ engineer nhận
  -- DELIVERED : engineer đã nhận, hoàn tất
  -- CANCELLED : engineer/warehouse huỷ

  -- Audit
  requested_by        UUID NOT NULL REFERENCES app.user_account(id),
  picked_by           UUID REFERENCES app.user_account(id),
  delivered_to        UUID REFERENCES app.user_account(id),
  picked_at           TIMESTAMPTZ,
  ready_at            TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,

  notes               TEXT,         -- engineer ghi mục đích / vị trí cần
  warehouse_notes     TEXT,         -- warehouse ghi chú khi chuẩn bị

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_request_no_uk
  ON app.material_request (request_no);

CREATE INDEX IF NOT EXISTS material_request_status_idx
  ON app.material_request (status, created_at DESC);

CREATE INDEX IF NOT EXISTS material_request_requester_idx
  ON app.material_request (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS material_request_bom_idx
  ON app.material_request (bom_template_id);

-- ════════════════════════════════════════════════════════════════════
-- 5. Material request line — chi tiết item + qty
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.material_request_line (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES app.material_request(id) ON DELETE CASCADE,
  line_no             INT NOT NULL,
  item_id             UUID NOT NULL REFERENCES app.item(id),
  requested_qty       NUMERIC(18, 4) NOT NULL CHECK (requested_qty > 0),
  picked_qty          NUMERIC(18, 4) NOT NULL DEFAULT 0,
  delivered_qty       NUMERIC(18, 4) NOT NULL DEFAULT 0,
  lot_serial_id       UUID REFERENCES app.inventory_lot_serial(id),
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS material_request_line_request_idx
  ON app.material_request_line (request_id);

CREATE INDEX IF NOT EXISTS material_request_line_item_idx
  ON app.material_request_line (item_id);
