-- ============================================================
-- Migration 0010: Order production notes + snapshot line edit support
-- V1.9 Phase 3 — Order detail tab "Sản xuất" editable
--
-- User chạy: hethong_app
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================

SET search_path TO app, public;

-- ---------- sales_order: production notes ----------
ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS production_notes TEXT;

ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS production_notes_updated_at TIMESTAMPTZ;

ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS production_notes_updated_by UUID
    REFERENCES app.user_account(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.sales_order.production_notes IS
  'V1.9 Phase 3: ghi chú sản xuất tự do (single field, updatable). Lịch sử qua audit_event WHERE object_type=sales_order AND action=UPDATE.';

-- ---------- bom_snapshot_line: user notes ----------
-- metadata jsonb đã tồn tại; thêm cột notes riêng để query/filter dễ hơn.
ALTER TABLE app.bom_snapshot_line
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN app.bom_snapshot_line.notes IS
  'V1.9 Phase 3: ghi chú sản xuất cho snapshot line (do operator/planner nhập).';
