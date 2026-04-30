-- V3.7.19 — PIC tracking fields cho bom_line.
--
-- Yêu cầu: PIC user có quyền update tiến độ của row mình phụ trách:
--   - received_qty: SL đã về (manual tracker, không thay PO ledger)
--   - expected_eta: ngày dự kiến giao
--   - status_note: ghi chú tiến độ (đã đặt / đang giao / về đủ / ...)

ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_eta DATE,
  ADD COLUMN IF NOT EXISTS status_note VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pic_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pic_updated_by UUID REFERENCES app.user_account(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bom_line_eta_idx ON app.bom_line (expected_eta) WHERE expected_eta IS NOT NULL;

COMMENT ON COLUMN app.bom_line.received_qty IS
  'V3.7.19 — SL đã về (manual tracker do PIC update, không thay inventory_txn).';
COMMENT ON COLUMN app.bom_line.expected_eta IS
  'V3.7.19 — Ngày NCC giao dự kiến cho line này (PIC tự cập nhật).';
COMMENT ON COLUMN app.bom_line.status_note IS
  'V3.7.19 — Note tiến độ ngắn (vd "đã đặt", "đang giao", "về đủ", "thiếu 5").';

-- ════════════════════════════════════════════════════════════════════
-- Seed 4 PIC users matching tên trong file 'BOM FINAL':
--   - NGUYEN-A  (full_name "Nguyện")
--   - VUONG-ANH-A (full_name "Vương Anh")
--   - TIEN-CUONG-A (full_name "Tiến/Cường")
--   - DUC-A     (full_name "Đức")
-- Password chung: Test@1234 (cùng hash với 4 dept users đã có).
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  pw_hash TEXT := '$argon2id$v=19$m=19456,t=2,p=1$1NBcjfLodc2CVyWzOAszvw$YOUm2lJDhFys01gn5bJHCSX1qOy5TkxF83gFN26tsf8';
  v_user_id UUID;
  v_role_id UUID;
  rec RECORD;
BEGIN
  -- Lấy role purchaser id (PIC chủ yếu là purchaser)
  SELECT id INTO v_role_id FROM app.role WHERE code = 'purchaser' LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE NOTICE 'Role purchaser không tồn tại — skip seed PIC users';
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('NGUYEN-A',     'Nguyện',      'nguyen.a@songchau.local'),
      ('VUONG-ANH-A',  'Vương Anh',   'vuong.anh.a@songchau.local'),
      ('TIEN-CUONG-A', 'Tiến/Cường',  'tien.cuong.a@songchau.local'),
      ('DUC-A',        'Đức',         'duc.a@songchau.local')
    ) AS t(username, full_name, email)
  LOOP
    SELECT id INTO v_user_id FROM app.user_account WHERE username = rec.username LIMIT 1;
    IF v_user_id IS NULL THEN
      INSERT INTO app.user_account (username, email, full_name, password_hash, is_active, must_change_password)
      VALUES (rec.username, rec.email, rec.full_name, pw_hash, TRUE, FALSE)
      RETURNING id INTO v_user_id;

      -- Gán role purchaser (PIC liên quan thu mua + nhận hàng)
      INSERT INTO app.user_role (user_id, role_id)
      VALUES (v_user_id, v_role_id)
      ON CONFLICT DO NOTHING;

      RAISE NOTICE 'CREATED PIC user % (id %)', rec.username, v_user_id;
    ELSE
      -- Update full_name nếu đã có
      UPDATE app.user_account
      SET full_name = rec.full_name, is_active = TRUE
      WHERE id = v_user_id;
      RAISE NOTICE 'SKIP user % (already exists)', rec.username;
    END IF;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- Backfill assigned_to_user_id từ assigned_to_name nếu match user
-- (nếu BOM đã import trước khi tạo PIC users)
-- ════════════════════════════════════════════════════════════════════
UPDATE app.bom_line bl
SET assigned_to_user_id = u.id
FROM app.user_account u
WHERE bl.assigned_to_user_id IS NULL
  AND bl.assigned_to_name IS NOT NULL
  AND u.full_name ILIKE '%' || bl.assigned_to_name || '%';
