-- V3.8.2 — Role 'display' (kiosk TV): CHỈ xem Bảng sản xuất (/board), phiên 24h.
-- Theo precedent 0033/0048: ALTER TYPE trong DO block (psql autocommit mỗi
-- statement) rồi INSERT role row.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'display'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
  ) THEN
    ALTER TYPE role_code ADD VALUE 'display';
  END IF;
END $$;

INSERT INTO app.role (code, display_name, description)
VALUES ('display', 'Màn hình TV', 'Tài khoản kiosk chỉ xem Bảng điều hành sản xuất (/board), phiên đăng nhập 24h')
ON CONFLICT (code) DO NOTHING;
