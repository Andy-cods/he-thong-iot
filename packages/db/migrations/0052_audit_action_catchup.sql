-- 0052_audit_action_catchup.sql
-- V3.10.3 — Catch-up: enum audit_action trên VPS production (45.124.94.13) chỉ có
-- 11/26 giá trị vì migration 0005a (V1.2) + 0006a (V1.3) chưa từng apply lên DB
-- này. Hậu quả: writeAudit() cho các action APPROVE/CONVERT/WO_*/ECO_*/QC_CHECK/
-- RESERVE/ISSUE/RECEIVE/TRANSITION ném lỗi enum → bị catch nuốt (chỉ log warn,
-- KHÔNG chặn nghiệp vụ) → mất bản ghi audit tương ứng.
--
-- Idempotent: ADD VALUE IF NOT EXISTS → no-op trên DB đã đủ enum (fresh deploy
-- tạo enum đầy đủ từ schema). ADD VALUE KHÔNG chạy trong transaction dùng ngay
-- giá trị mới → để mỗi statement autocommit riêng, KHÔNG bọc BEGIN/COMMIT.

-- V1.2 (0005a)
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'TRANSITION';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'RESERVE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ISSUE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'RECEIVE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'APPROVE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'CONVERT';

-- V1.3 (0006a)
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'WO_START';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'WO_PAUSE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'WO_RESUME';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'WO_COMPLETE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ECO_SUBMIT';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ECO_APPROVE';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ECO_APPLY';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ECO_REJECT';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'QC_CHECK';
