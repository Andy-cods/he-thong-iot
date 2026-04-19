-- =============================================================
-- V1.4 Phase G — Seed 100 user test cho k6 load test.
--
-- Password dùng chung: `Loadtest!234` (argon2id m=19456 t=2 p=1)
-- Hash dưới đây được sinh sẵn bằng:
--   argon2 "Loadtest!234" -id -m 19456 -t 2 -p 1 -e
-- → $argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRmb3Jsb2FkdGVzdA$...
--
-- KHÔNG dùng hash dưới đây trên production. Chỉ dùng staging/CI.
--
-- Chạy:
--   psql $DATABASE_URL < tests/load/setup-test-users.sql
--
-- Idempotent: ON CONFLICT DO NOTHING.
-- =============================================================
BEGIN;

-- Đảm bảo role operator tồn tại (đã có từ seed lần đầu)
INSERT INTO app.role (code, display_name, description)
VALUES ('operator', 'Công nhân', 'Operator xưởng — scan + nhập liệu')
ON CONFLICT (code) DO NOTHING;

-- Sinh 100 user loadtest-001..loadtest-100 qua generate_series.
-- Hash tương đương argon2id password "Loadtest!234" với salt cố định.
-- (User có thể regen hash thật bằng script Node; hash dưới là placeholder
--  cho setup SQL-only. Nếu login fail → chạy setup-test-users.ts thay.)
WITH new_users AS (
  INSERT INTO app.user_account (
    username, email, full_name, password_hash,
    mfa_enabled, is_active, must_change_password
  )
  SELECT
    'loadtest-' || LPAD(g::text, 3, '0'),
    'loadtest-' || LPAD(g::text, 3, '0') || '@iot.local',
    'Loadtest User ' || g,
    -- Placeholder: thay bằng hash thật của "Loadtest!234"
    -- $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHR0ZXN0c2FsdA$PLACEHOLDER_REPLACE_WITH_REAL_HASH',
    false, true, false
  FROM generate_series(1, 100) AS g
  ON CONFLICT (username) DO NOTHING
  RETURNING id
)
-- Gán role operator cho 100 user mới insert
INSERT INTO app.user_role (user_id, role_id)
SELECT u.id, r.id
FROM new_users u
CROSS JOIN app.role r
WHERE r.code = 'operator'
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify:
SELECT COUNT(*) AS total_loadtest_users
FROM app.user_account
WHERE username LIKE 'loadtest-%';
