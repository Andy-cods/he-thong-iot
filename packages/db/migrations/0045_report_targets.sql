-- V3.7.62 — KPI Targets cho Employee Productivity Report.
-- Admin set baseline target cho metric × role (× period type) → hiển thị
-- "đạt/chưa đạt" trên KPI cards. User decision: admin có thể chỉnh sửa được.

CREATE TABLE IF NOT EXISTS app.report_target (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Role áp dụng (admin/planner/operator/warehouse/purchaser).
      NULL = áp dụng cho mọi role (rare). */
  role_code       VARCHAR(32),
  /** Metric ID (xem repo employeeProductivity.ts — khớp metric.id). */
  metric_id       VARCHAR(64) NOT NULL,
  /** Period type: monthly / quarterly / yearly. Mặc định monthly. */
  period_type     VARCHAR(16) NOT NULL DEFAULT 'monthly',
  /** Giá trị target. Numeric để flex (count hay sum đều fit). */
  target_value    NUMERIC(18,4) NOT NULL,
  /** Mode: gte (≥, default — ngày càng cao càng tốt như sản lượng)
            lte (≤ — vd phế phẩm càng thấp càng tốt). */
  comparison      VARCHAR(8) NOT NULL DEFAULT 'gte',
  /** Note hiển thị tooltip cho admin / user xem giải thích target. */
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES app.user_account(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES app.user_account(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraints + indexes
ALTER TABLE app.report_target
  DROP CONSTRAINT IF EXISTS report_target_period_chk;
ALTER TABLE app.report_target
  ADD CONSTRAINT report_target_period_chk CHECK (
    period_type IN ('monthly', 'quarterly', 'yearly')
  );

ALTER TABLE app.report_target
  DROP CONSTRAINT IF EXISTS report_target_comparison_chk;
ALTER TABLE app.report_target
  ADD CONSTRAINT report_target_comparison_chk CHECK (
    comparison IN ('gte', 'lte')
  );

-- Unique: 1 target per (role, metric, period_type) when active
CREATE UNIQUE INDEX IF NOT EXISTS report_target_unique_active
  ON app.report_target (role_code, metric_id, period_type)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS report_target_role_idx
  ON app.report_target (role_code, is_active);

COMMENT ON TABLE app.report_target IS
  'V3.7.62 — KPI baseline targets cho employee productivity. Admin CRUD.';
COMMENT ON COLUMN app.report_target.metric_id IS
  'Khớp với metric.id trong repo employeeProductivity.ts (vd: wo_completed, production_qty_good).';

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM information_schema.tables
    WHERE table_schema='app' AND table_name='report_target';
  IF n = 0 THEN
    RAISE EXCEPTION 'Migration 0045 incomplete: table report_target missing';
  END IF;
  RAISE NOTICE 'migration 0045: app.report_target created (KPI baseline)';
END $$;
