-- packages/db/migrations/0007b_session_enhance.sql
-- V1.4 Phase D — Session mgmt + Reset password flow
-- Role: hethong_app (không cần superuser)
--
-- Scope:
--  - session: thêm last_seen_at (cho UI "Last seen" column)
--  - user_account: thêm must_change_password + password_reset_token_hash
--    + password_reset_expires_at để hỗ trợ Admin reset + future self-reset.
--  - Indexes tối thiểu.
--
-- KHÔNG drop cột nào. Backward-compat 100% — session schema sẵn đã có
-- revoked_at / user_agent / ip_address từ V1.

BEGIN;

-- session delta
ALTER TABLE app.session
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- user_account delta — password reset flow + force change flag
ALTER TABLE app.user_account
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash text,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;

-- Index: lọc nhanh session active (chưa revoke + chưa hết hạn)
CREATE INDEX IF NOT EXISTS session_user_active_idx
  ON app.session (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- Index: truy vấn nhanh user đang bị force change password
CREATE INDEX IF NOT EXISTS user_must_change_idx
  ON app.user_account (must_change_password)
  WHERE must_change_password = true;

-- Index: lookup reset token (rare, partial)
CREATE INDEX IF NOT EXISTS user_reset_token_idx
  ON app.user_account (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;

COMMIT;
