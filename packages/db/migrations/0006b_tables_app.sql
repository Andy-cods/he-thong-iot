-- =============================================================
-- Migration 0006b · V1.3 tables (app-user)
-- =============================================================
-- Chạy bằng hethong_app (owner schema app đã được cấp CREATE).
-- Idempotent: CREATE TABLE IF NOT EXISTS + ALTER ... ADD COLUMN IF NOT EXISTS.
-- =============================================================

-- ============================================================
-- §1. Work Order enhancements
-- ============================================================
ALTER TABLE app.work_order
  ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version_lock INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- §2. Work Order Line — 1 WO → N snapshot_lines
-- ============================================================
CREATE TABLE IF NOT EXISTS app.work_order_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES app.work_order(id) ON DELETE CASCADE,
  snapshot_line_id UUID NOT NULL REFERENCES app.bom_snapshot_line(id),
  required_qty NUMERIC(18,4) NOT NULL CHECK (required_qty > 0),
  completed_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_order_line_unique_snap UNIQUE (wo_id, snapshot_line_id)
);

-- ============================================================
-- §3. Reservation — map snapshot_line ↔ lot
-- ============================================================
CREATE TABLE IF NOT EXISTS app.reservation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_line_id UUID NOT NULL REFERENCES app.bom_snapshot_line(id) ON DELETE CASCADE,
  lot_serial_id UUID NOT NULL REFERENCES app.inventory_lot_serial(id),
  wo_id UUID REFERENCES app.work_order(id),
  reserved_qty NUMERIC(18,4) NOT NULL CHECK (reserved_qty > 0),
  status app.reservation_status NOT NULL DEFAULT 'ACTIVE',
  reservation_reason app.reservation_reason NOT NULL DEFAULT 'AUTO_FIFO',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reserved_by UUID REFERENCES app.user_account(id),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES app.user_account(id),
  release_reason VARCHAR(64),
  notes TEXT,
  version_lock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- §4. ECO Change — header + lines
-- ============================================================
CREATE TABLE IF NOT EXISTS app.eco_change (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  title VARCHAR(256) NOT NULL,
  description TEXT,
  status app.eco_status NOT NULL DEFAULT 'DRAFT',
  affected_template_id UUID NOT NULL REFERENCES app.bom_template(id),
  old_revision_id UUID REFERENCES app.bom_revision(id),
  new_revision_id UUID REFERENCES app.bom_revision(id),
  requested_by UUID REFERENCES app.user_account(id),
  approved_by UUID REFERENCES app.user_account(id),
  applied_by UUID REFERENCES app.user_account(id),
  rejected_by UUID REFERENCES app.user_account(id),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejected_reason TEXT,
  affected_orders_count INTEGER NOT NULL DEFAULT 0,
  apply_job_id VARCHAR(64),
  apply_progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.eco_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eco_id UUID NOT NULL REFERENCES app.eco_change(id) ON DELETE CASCADE,
  action app.eco_action_type NOT NULL,
  target_line_id UUID REFERENCES app.bom_line(id),
  component_item_id UUID REFERENCES app.item(id),
  qty_per_parent NUMERIC(18,6),
  scrap_percent NUMERIC(6,3),
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- §5. QC Check — stub V1.3 (hardcode checkpoint)
-- ============================================================
CREATE TABLE IF NOT EXISTS app.qc_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES app.work_order(id) ON DELETE CASCADE,
  checkpoint_name VARCHAR(128) NOT NULL,
  checkpoint app.qc_checkpoint,
  result app.qc_check_result,
  note TEXT,
  checked_by UUID REFERENCES app.user_account(id),
  checked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- §6. Assembly Scan enhancement — link WO + lot + reservation
-- ============================================================
ALTER TABLE app.assembly_order
  ADD COLUMN IF NOT EXISTS wo_id UUID REFERENCES app.work_order(id);

ALTER TABLE app.assembly_scan
  ADD COLUMN IF NOT EXISTS wo_id UUID REFERENCES app.work_order(id),
  ADD COLUMN IF NOT EXISTS lot_serial_id UUID REFERENCES app.inventory_lot_serial(id),
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES app.reservation(id);

DO $$
BEGIN
  RAISE NOTICE 'migration 0006b: 5 bảng mới (work_order_line, reservation, eco_change, eco_line, qc_check) + ALTER work_order/assembly_order/assembly_scan';
END $$;
