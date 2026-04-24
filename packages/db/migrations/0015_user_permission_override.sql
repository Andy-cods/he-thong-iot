-- ============================================================================
-- V1.9 Phase 10 — RBAC per-user permission override.
-- ----------------------------------------------------------------------------
-- Bảng `user_permission_override` cho phép admin grant / deny quyền per-user
-- ngoài khung role default. Logic merge: deny > role > grant
--   - granted = true  → ESCALATE: thêm quyền user dù role không có.
--   - granted = false → REVOKE  : thu hồi quyền user dù role có (deny wins).
--   - expires_at      → null = vĩnh viễn; > NOW() = còn hiệu lực.
--
-- UNIQUE (user_id, entity, action): mỗi (user, entity, action) chỉ có 1 row.
-- Idempotent: IF NOT EXISTS trên mọi tạo.
-- ============================================================================

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.user_permission_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.user_account(id) ON DELETE CASCADE,
  entity VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  granted BOOLEAN NOT NULL,
  reason TEXT,
  granted_by UUID REFERENCES app.user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT user_permission_override_uk UNIQUE (user_id, entity, action)
);

CREATE INDEX IF NOT EXISTS user_permission_override_user_idx
  ON app.user_permission_override (user_id);

CREATE INDEX IF NOT EXISTS user_permission_override_active_idx
  ON app.user_permission_override (user_id, entity, action)
  WHERE expires_at IS NULL OR expires_at > NOW();

COMMENT ON TABLE app.user_permission_override IS
  'V1.9 P10: per-user override permissions. granted=true thêm quyền (role không có), granted=false thu hồi (role có nhưng deny user này).';
