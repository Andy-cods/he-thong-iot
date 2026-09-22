-- V4.0 — Seed 4 tài khoản DÀNH RIÊNG CHO TEST E2E (idempotent).
--
-- Lý do tồn tại: các account thật trên prod là của NHÂN VIÊN (THIETKE-DUC,
-- KHO-HOA, THUMUA-KETOAN...) — test e2e KHÔNG được dùng mật khẩu của họ.
-- Bộ account `e2e.*` dưới đây chỉ phục vụ tests/e2e/notification-flow.mjs.
--
-- Password: Test@1234 (argon2id hash pre-compute, tái dùng từ seed-ketoan-user.sql).
-- must_change_password = FALSE — test cần login thẳng, không qua bước đổi mật khẩu.
--
-- AN TOÀN: đặt is_active=TRUE để login được. Nếu muốn khoá sau khi test xong:
--   UPDATE app.user_account SET is_active = FALSE WHERE username LIKE 'e2e.%';

DO $$
DECLARE
  pw_hash TEXT := '$argon2id$v=19$m=19456,t=2,p=1$1NBcjfLodc2CVyWzOAszvw$YOUm2lJDhFys01gn5bJHCSX1qOy5TkxF83gFN26tsf8';
  v_user_id UUID;
  v_role_id UUID;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('e2e.planner',   'planner',   'E2E Test — Thiết kế'),
      ('e2e.warehouse', 'warehouse', 'E2E Test — Kho'),
      ('e2e.purchaser', 'purchaser', 'E2E Test — Thu mua'),
      ('e2e.operator',  'operator',  'E2E Test — Gia công')
    ) AS t(uname, rcode, fullname)
  LOOP
    SELECT id INTO v_user_id FROM app.user_account WHERE username = rec.uname LIMIT 1;
    IF v_user_id IS NULL THEN
      INSERT INTO app.user_account (username, email, full_name, password_hash, is_active, must_change_password)
      VALUES (rec.uname, rec.uname || '@e2e.local', rec.fullname, pw_hash, TRUE, FALSE)
      RETURNING id INTO v_user_id;
      RAISE NOTICE 'CREATED %', rec.uname;
    ELSE
      -- Reset lại mật khẩu + mở khoá để test luôn chạy được (idempotent).
      UPDATE app.user_account
         SET password_hash = pw_hash,
             is_active = TRUE,
             must_change_password = FALSE,
             locked_until = NULL,
             failed_login_count = 0
       WHERE id = v_user_id;
      RAISE NOTICE 'RESET %', rec.uname;
    END IF;

    SELECT id INTO v_role_id FROM app.role WHERE code = rec.rcode::role_code LIMIT 1;
    IF v_role_id IS NULL THEN
      RAISE WARNING 'Role % không tồn tại', rec.rcode;
    ELSE
      INSERT INTO app.user_role (user_id, role_id)
      VALUES (v_user_id, v_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
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
WHERE u.username LIKE 'e2e.%'
GROUP BY u.id, u.username, u.full_name, u.is_active, u.must_change_password
ORDER BY u.username;
