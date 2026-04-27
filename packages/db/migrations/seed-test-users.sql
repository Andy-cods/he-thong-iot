-- V3.3 — Seed 4 test users theo phòng ban (idempotent).
-- Password chung: Test@1234 (argon2id hash đã pre-compute)
-- Run sau migration 0033 đã apply (cần role 'purchaser').

DO $$
DECLARE
  pw_hash TEXT := '$argon2id$v=19$m=19456,t=2,p=1$1NBcjfLodc2CVyWzOAszvw$YOUm2lJDhFys01gn5bJHCSX1qOy5TkxF83gFN26tsf8';
  v_user_id UUID;
  v_role_id UUID;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('bo.phan.thiet.ke', 'Bộ phận Thiết kế', 'thietke@songchau.local', 'planner'),
      ('bo.phan.thu.mua',  'Bộ phận Thu mua',  'thumua@songchau.local',  'purchaser'),
      ('bo.phan.kho',      'Bộ phận Kho',      'kho@songchau.local',     'warehouse'),
      ('bo.phan.van.hanh', 'Bộ phận Vận hành', 'vanhanh@songchau.local', 'operator')
    ) AS t(username, full_name, email, role_code)
  LOOP
    -- Skip nếu user đã tồn tại
    SELECT id INTO v_user_id FROM app.user_account WHERE username = rec.username LIMIT 1;
    IF v_user_id IS NULL THEN
      INSERT INTO app.user_account (username, email, full_name, password_hash, is_active, must_change_password)
      VALUES (rec.username, rec.email, rec.full_name, pw_hash, TRUE, FALSE)
      RETURNING id INTO v_user_id;
      RAISE NOTICE 'CREATED user % (id %)', rec.username, v_user_id;
    ELSE
      RAISE NOTICE 'SKIP user % (already exists)', rec.username;
    END IF;

    -- Đảm bảo có role link
    SELECT id INTO v_role_id FROM app.role WHERE code = rec.role_code::role_code LIMIT 1;
    IF v_role_id IS NULL THEN
      RAISE WARNING 'Role % không tồn tại — bỏ qua link', rec.role_code;
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
  u.is_active
FROM app.user_account u
LEFT JOIN app.user_role ur ON ur.user_id = u.id
LEFT JOIN app.role r ON r.id = ur.role_id
WHERE u.username LIKE 'bo.phan.%'
GROUP BY u.id, u.username, u.full_name, u.is_active
ORDER BY u.username;
