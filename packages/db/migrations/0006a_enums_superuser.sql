-- =============================================================
-- Migration 0006a · V1.3 enums (superuser)
-- =============================================================
-- Yêu cầu superuser vì:
--   1) ALTER TYPE ADD VALUE trên enum app.work_order_status + app.audit_action.
--   2) CREATE TYPE trong schema app.
-- Idempotent: `IF NOT EXISTS` (ADD VALUE) + guard DO block (CREATE TYPE).
-- Note: ALTER TYPE ADD VALUE KHÔNG chạy được trong transaction block;
--        apply-sql-migrations.sh dùng psql -f nên OK (mỗi stmt tự commit).
-- =============================================================

-- 1) Mở rộng enum app.work_order_status (đã có DRAFT/RELEASED/IN_PROGRESS/COMPLETED/CANCELLED)
--    V1.3 thêm QUEUED (giữa DRAFT và IN_PROGRESS) + PAUSED (sau IN_PROGRESS).
ALTER TYPE app.work_order_status ADD VALUE IF NOT EXISTS 'QUEUED' BEFORE 'IN_PROGRESS';
ALTER TYPE app.work_order_status ADD VALUE IF NOT EXISTS 'PAUSED' AFTER 'IN_PROGRESS';

-- 2) Enum reservation_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE app.reservation_status AS ENUM (
      'ACTIVE',
      'RELEASED',
      'CONSUMED'
    );
  END IF;
END $$;

-- 3) Enum reservation_reason (lý do pick lot)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_reason') THEN
    CREATE TYPE app.reservation_reason AS ENUM (
      'AUTO_FIFO',
      'AUTO_FEFO',
      'MANUAL',
      'OVERRIDE'
    );
  END IF;
END $$;

-- 4) Enum eco_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eco_status') THEN
    CREATE TYPE app.eco_status AS ENUM (
      'DRAFT',
      'SUBMITTED',
      'APPROVED',
      'APPLIED',
      'REJECTED'
    );
  END IF;
END $$;

-- 5) Enum eco_action_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eco_action_type') THEN
    CREATE TYPE app.eco_action_type AS ENUM (
      'ADD_LINE',
      'REMOVE_LINE',
      'UPDATE_QTY',
      'UPDATE_SCRAP',
      'REPLACE_COMPONENT'
    );
  END IF;
END $$;

-- 6) Enum qc_check_result
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qc_check_result') THEN
    CREATE TYPE app.qc_check_result AS ENUM (
      'PASS',
      'FAIL',
      'NA'
    );
  END IF;
END $$;

-- 7) Enum qc_checkpoint (hardcode 3 checkpoint V1.3 stub)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qc_checkpoint') THEN
    CREATE TYPE app.qc_checkpoint AS ENUM (
      'PRE_ASSEMBLY',
      'MID_PRODUCTION',
      'PRE_FG'
    );
  END IF;
END $$;

-- 8) Mở rộng audit_action cho WO / ECO / QC
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'WO_START';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'WO_PAUSE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'WO_RESUME';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'WO_COMPLETE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'ECO_SUBMIT';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'ECO_APPROVE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'ECO_APPLY';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'ECO_REJECT';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'QC_CHECK';

DO $$
BEGIN
  RAISE NOTICE 'migration 0006a: enums created (reservation_status, reservation_reason, eco_status, eco_action_type, qc_check_result, qc_checkpoint) + ALTER work_order_status + audit_action';
END $$;
