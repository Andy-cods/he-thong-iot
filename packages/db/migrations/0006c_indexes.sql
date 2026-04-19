-- =============================================================
-- Migration 0006c · V1.3 indexes + advisory lock function (app-user)
-- =============================================================
-- Idempotent: CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- =============================================================

-- ============================================================
-- §1. Work Order indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS work_order_priority_idx
  ON app.work_order(priority, created_at)
  WHERE status IN ('QUEUED', 'IN_PROGRESS');

CREATE INDEX IF NOT EXISTS work_order_linked_order_idx
  ON app.work_order(linked_order_id)
  WHERE linked_order_id IS NOT NULL;

-- ============================================================
-- §2. Work Order Line indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS work_order_line_wo_idx
  ON app.work_order_line(wo_id);

CREATE INDEX IF NOT EXISTS work_order_line_snap_idx
  ON app.work_order_line(snapshot_line_id);

-- ============================================================
-- §3. Reservation indexes (partial cho ACTIVE)
-- ============================================================
CREATE INDEX IF NOT EXISTS reservation_snap_idx
  ON app.reservation(snapshot_line_id);

CREATE INDEX IF NOT EXISTS reservation_lot_idx
  ON app.reservation(lot_serial_id);

CREATE INDEX IF NOT EXISTS reservation_wo_idx
  ON app.reservation(wo_id)
  WHERE wo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservation_lot_active_idx
  ON app.reservation(lot_serial_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS reservation_snap_active_idx
  ON app.reservation(snapshot_line_id)
  WHERE status = 'ACTIVE';

-- ============================================================
-- §4. ECO indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS eco_change_status_idx
  ON app.eco_change(status);

CREATE INDEX IF NOT EXISTS eco_change_template_idx
  ON app.eco_change(affected_template_id);

CREATE INDEX IF NOT EXISTS eco_change_title_trgm_idx
  ON app.eco_change USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS eco_change_code_trgm_idx
  ON app.eco_change USING gin (code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS eco_line_eco_idx
  ON app.eco_line(eco_id);

CREATE INDEX IF NOT EXISTS eco_line_target_idx
  ON app.eco_line(target_line_id)
  WHERE target_line_id IS NOT NULL;

-- ============================================================
-- §5. QC Check indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS qc_check_wo_idx
  ON app.qc_check(wo_id, checked_at);

CREATE INDEX IF NOT EXISTS qc_check_checkpoint_idx
  ON app.qc_check(checkpoint)
  WHERE checkpoint IS NOT NULL;

-- ============================================================
-- §6. Assembly scan V1.3 indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS assembly_scan_wo_idx
  ON app.assembly_scan(wo_id)
  WHERE wo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assembly_scan_lot_idx
  ON app.assembly_scan(lot_serial_id)
  WHERE lot_serial_id IS NOT NULL;

-- ============================================================
-- §7. Advisory lock helper function
--     Serialize reservation per item bằng pg_advisory_xact_lock.
--     Input: item_id UUID → hash tới int8 → lock key 1.
--     KEY 2 = 0 (reservation namespace); 1 cho product lines future.
-- ============================================================
CREATE OR REPLACE FUNCTION app.reservation_lock(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_item_id::text)::bigint, 0);
END;
$$;

-- Grant EXECUTE cho hethong_app (function tạo bởi hethong_app — owner đã có).
-- Explicit cho rõ ý.
GRANT EXECUTE ON FUNCTION app.reservation_lock(UUID) TO hethong_app;

DO $$
BEGIN
  RAISE NOTICE 'migration 0006c: indexes + advisory lock function app.reservation_lock()';
END $$;
