-- 0072_pr_approval_step_cancelled.sql
-- V4.4 (Việc 4) — bổ sung 'CANCELLED' vào CHECK constraint `pr_approval_step_chk`.
--
-- Phát hiện qua kiểm E2E thật sau khi migration 0069 được áp: 0069 chỉ thêm
-- value 'CANCELLED' vào ENUM `app.purchase_request_status` (cột `status`),
-- nhưng BỎ SÓT constraint CHECK riêng trên cột `approval_step` (varchar,
-- KHÔNG phải enum — xem migration 0046_pr_mrf_workflow.sql) — `cancelPR()`
-- set `approval_step='CANCELLED'` bị Postgres chặn:
--   "new row for relation purchase_request violates check constraint
--    pr_approval_step_chk" (mã lỗi 23514).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS rồi ADD lại với đủ giá trị (giữ
-- nguyên toàn bộ danh sách cũ + thêm CANCELLED) — bọc BEGIN/COMMIT vì đây là
-- ALTER TABLE thường (không phải ALTER TYPE ADD VALUE nên không có ràng buộc
-- "không transaction" như 0069).

BEGIN;

ALTER TABLE app.purchase_request
  DROP CONSTRAINT IF EXISTS pr_approval_step_chk;
ALTER TABLE app.purchase_request
  ADD CONSTRAINT pr_approval_step_chk CHECK (
    approval_step IN (
      'DRAFT',
      'SUBMITTED',
      'DEPT_APPROVED',
      'DIRECTOR_APPROVED',
      'CONVERTED',
      'DONE',
      'REJECTED',
      'CANCELLED'
    )
  );

COMMIT;
