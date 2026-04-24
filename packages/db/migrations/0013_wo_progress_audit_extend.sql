-- ============================================================================
-- V1.9 Phase 4 — WO detail cực chi tiết: progress log + QC checklist items
--                + routing/material/tolerance metadata trên work_order.
-- ----------------------------------------------------------------------------
-- Bối cảnh: WO detail hiện chỉ có 4 tab stub (Thông tin/Tiến độ/QC/Audit)
-- sơ sài, không có form báo cáo tiến độ thật, QC chỉ 3 radio PASS/FAIL/NA,
-- audit chưa render. Phase 4 nâng cấp để phù hợp quy trình gia công thật.
--
-- 1) app.wo_progress_log — nhật ký tiến độ thật thời gian thực của WO/line.
-- 2) app.qc_check_item  — checklist chi tiết per QC stage (không chỉ 1 radio).
-- 3) ALTER work_order  — routing_plan / material_requirements /
--                        technical_drawing_url / tolerance_specs /
--                        estimated_hours / actual_hours (JSONB + text).
--
-- Idempotent: IF NOT EXISTS trên mọi tạo. Không xóa data cũ.
-- ============================================================================

SET search_path TO app, public;

-- ----------------------------------------------------------------------------
-- 1) Bảng wo_progress_log — nhật ký tiến độ
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.wo_progress_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL
    REFERENCES app.work_order(id) ON DELETE CASCADE,
  work_order_line_id UUID
    REFERENCES app.work_order_line(id) ON DELETE CASCADE,
  step_type VARCHAR(50) NOT NULL,
  qty_completed NUMERIC(18, 4) NOT NULL DEFAULT 0,
  qty_scrap NUMERIC(18, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  photo_url TEXT,
  operator_id UUID
    REFERENCES app.user_account(id) ON DELETE SET NULL,
  station VARCHAR(100),
  duration_minutes INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wo_progress_log_wo_idx
  ON app.wo_progress_log (work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wo_progress_log_line_idx
  ON app.wo_progress_log (work_order_line_id)
  WHERE work_order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wo_progress_log_step_idx
  ON app.wo_progress_log (work_order_id, step_type);

COMMENT ON TABLE app.wo_progress_log IS
  'V1.9 P4: nhật ký tiến độ thật thời gian thực của WO/line. '
  'step_type: PROGRESS_REPORT | PAUSE | RESUME | QC_PASS | QC_FAIL | ISSUE | NOTE | PHOTO.';
COMMENT ON COLUMN app.wo_progress_log.step_type IS
  'Loại bước: PROGRESS_REPORT | PAUSE | RESUME | QC_PASS | QC_FAIL | ISSUE | NOTE | PHOTO.';
COMMENT ON COLUMN app.wo_progress_log.station IS
  'Máy / trạm thực hiện bước (ví dụ CNC-01, MIG-Trạm 2).';

-- ----------------------------------------------------------------------------
-- 2) Bảng qc_check_item — checklist item per qc_check (3 stage)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.qc_check_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_check_id UUID NOT NULL
    REFERENCES app.qc_check(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  check_type VARCHAR(50) NOT NULL DEFAULT 'BOOLEAN',
  expected_value VARCHAR(100),
  actual_value VARCHAR(100),
  result VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  defect_reason TEXT,
  photo_url TEXT,
  checked_by UUID
    REFERENCES app.user_account(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qc_check_item_check_idx
  ON app.qc_check_item (qc_check_id, sort_order);

COMMENT ON TABLE app.qc_check_item IS
  'V1.9 P4: checklist item chi tiết thuộc về 1 qc_check (stage PRE_ASSEMBLY/MID/PRE_FG). '
  'check_type: BOOLEAN | MEASUREMENT | VISUAL. '
  'result: PENDING | PASS | FAIL | NA.';
COMMENT ON COLUMN app.qc_check_item.expected_value IS
  'Giá trị kỳ vọng (ví dụ kích thước 120mm ±0.1, hoặc true cho BOOLEAN).';
COMMENT ON COLUMN app.qc_check_item.actual_value IS
  'Giá trị đo/quan sát thực tế (tự do text).';

-- ----------------------------------------------------------------------------
-- 3) ALTER work_order — routing/material/tolerance/estimated_hours
-- ----------------------------------------------------------------------------
ALTER TABLE app.work_order
  ADD COLUMN IF NOT EXISTS routing_plan JSONB,
  ADD COLUMN IF NOT EXISTS material_requirements JSONB,
  ADD COLUMN IF NOT EXISTS technical_drawing_url TEXT,
  ADD COLUMN IF NOT EXISTS tolerance_specs JSONB,
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2);

COMMENT ON COLUMN app.work_order.routing_plan IS
  'V1.9 P4: array steps [{step_no, name, machine, setup_min, cycle_min, operator_id, status}].';
COMMENT ON COLUMN app.work_order.material_requirements IS
  'V1.9 P4: array [{item_id, sku, name, qty, uom, allocated_qty, lot_codes[]}].';
COMMENT ON COLUMN app.work_order.tolerance_specs IS
  'V1.9 P4: object {dimension_tolerance, surface_finish, hardness, other...}.';
COMMENT ON COLUMN app.work_order.technical_drawing_url IS
  'V1.9 P4: URL tới bản vẽ kỹ thuật (PDF/DWG) trên object storage.';
COMMENT ON COLUMN app.work_order.estimated_hours IS
  'V1.9 P4: thời gian ước tính (giờ) để planner lập kế hoạch.';
COMMENT ON COLUMN app.work_order.actual_hours IS
  'V1.9 P4: thời gian thực tế đã dùng (tự động cộng từ wo_progress_log.duration_minutes).';
