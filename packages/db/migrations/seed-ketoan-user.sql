-- V3.9 — Seed acc kế toán 'ketoan' (idempotent). Chạy SAU migration 0050
-- (cần role 'accountant'). Password: Test@1234 (argon2id hash pre-compute,
-- tái dùng từ seed-test-users.sql). must_change_password = TRUE → bắt đổi
-- mật khẩu lần đầu đăng nhập.

DO $$
DECLARE
  pw_hash TEXT := '$argon2id$v=19$m=19456,t=2,p=1$1NBcjfLodc2CVyWzOAszvw$YOUm2lJDhFys01gn5bJHCSX1qOy5TkxF83gFN26tsf8';
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM app.user_account WHERE username = 'ketoan' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO app.user_account (username, email, full_name, password_hash, is_active, must_change_password)
    VALUES ('ketoan', 'ketoan@songchau.local', 'Bộ phận Kế toán', pw_hash, TRUE, TRUE)
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'CREATED user ketoan (id %)', v_user_id;
  ELSE
    RAISE NOTICE 'SKIP user ketoan (already exists)';
  END IF;

  SELECT id INTO v_role_id FROM app.role WHERE code = 'accountant'::role_code LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE WARNING 'Role accountant không tồn tại — chạy 0050 trước';
  ELSE
    INSERT INTO app.user_role (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Verify
SELECT
  u.username,
  u.full_name,
  string_agg(r.code::text, ', ' ORDER BY r.code) AS roles,
  u.is_active,
  u.must_change_password
FROM app.user_account u
LEFT JOIN app.user_role ur ON ur.user_id = u.id
LEFT JOIN app.role r ON r.id = ur.role_id
WHERE u.username = 'ketoan'
GROUP BY u.id, u.username, u.full_name, u.is_active, u.must_change_password;
