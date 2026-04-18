-- 0004_audit_action_upload_commit.sql
-- Mở rộng enum app.audit_action thêm 'UPLOAD' + 'COMMIT' để phục vụ
-- flow import (UPLOAD = nạp file preview, COMMIT = chạy job BullMQ).
-- Idempotent: dùng IF NOT EXISTS nên apply lại được.
-- NOTE: ALTER TYPE ADD VALUE phải chạy ngoài transaction khối,
-- psql `\i` hoặc drizzle-kit chạy từng statement là OK.

ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'UPLOAD';
ALTER TYPE app.audit_action ADD VALUE IF NOT EXISTS 'COMMIT';
