-- =============================================================
-- Migration 0005a · Enums cho V1.2 (superuser)
-- =============================================================
-- Yêu cầu superuser vì:
--   1) ALTER TYPE ADD VALUE trên enum app.audit_action (owned by postgres).
--   2) CREATE TYPE trong schema app (owner grant đã có — chạy postgres cho an toàn).
-- Idempotent: dùng `IF NOT EXISTS` (add value) + guard DO block (CREATE TYPE).
-- Note: ALTER TYPE ADD VALUE không chạy được trong transaction block,
--        apply-sql-migrations.sh dùng psql -f nên OK.
-- =============================================================

-- 0) Extension ltree (cho bom_snapshot_line.path tree query)
CREATE EXTENSION IF NOT EXISTS ltree;

-- 1) Mở rộng enum app.audit_action cho các action mới V1.2
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'TRANSITION';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'RESERVE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'ISSUE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'RECEIVE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'APPROVE';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'CONVERT';
-- (RELEASE, SNAPSHOT đã có sẵn từ V1.0 enum)

-- 2) Enum 10-state cho bom_snapshot_line
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bom_snapshot_line_state') THEN
    CREATE TYPE app.bom_snapshot_line_state AS ENUM (
      'PLANNED',
      'PURCHASING',
      'IN_PRODUCTION',
      'INBOUND_QC',
      'PROD_QC',
      'AVAILABLE',
      'RESERVED',
      'ISSUED',
      'ASSEMBLED',
      'CLOSED'
    );
  END IF;
END $$;

-- 3) Enum bom_revision_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bom_revision_status') THEN
    CREATE TYPE app.bom_revision_status AS ENUM (
      'DRAFT',
      'RELEASED',
      'SUPERSEDED'
    );
  END IF;
END $$;

-- 4) Enum purchase_request_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_request_status') THEN
    CREATE TYPE app.purchase_request_status AS ENUM (
      'DRAFT',
      'SUBMITTED',
      'APPROVED',
      'CONVERTED',
      'REJECTED'
    );
  END IF;
END $$;

-- 5) Enum lot_status (QC HOLD)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lot_status') THEN
    CREATE TYPE app.lot_status AS ENUM (
      'AVAILABLE',
      'HOLD',
      'CONSUMED',
      'EXPIRED'
    );
  END IF;
END $$;

-- Grant usage cho hethong_app để các migration sau (chạy user hethong_app) dùng được
GRANT USAGE ON SCHEMA app TO hethong_app;

DO $$
BEGIN
  RAISE NOTICE 'migration 0005a: enums created/extended (audit_action +6, bom_snapshot_line_state, bom_revision_status, purchase_request_status, lot_status)';
END $$;
