-- ============================================================================
-- V1.9 Phase 4 hotfix — bổ sung enum value PAUSED + QUEUED cho work_order_status
-- ----------------------------------------------------------------------------
-- Migration 0006a (V1.3) đã có nhưng chưa apply trên VPS production hiện tại.
-- File này tách riêng để chỉ chạy ALTER TYPE ADD VALUE (lệnh single, auto-commit).
-- Idempotent: IF NOT EXISTS.
-- ============================================================================

ALTER TYPE public.work_order_status ADD VALUE IF NOT EXISTS 'QUEUED' BEFORE 'IN_PROGRESS';
ALTER TYPE public.work_order_status ADD VALUE IF NOT EXISTS 'PAUSED' AFTER 'IN_PROGRESS';
