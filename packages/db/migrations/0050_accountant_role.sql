-- V3.9 — Role 'accountant' (Bộ phận Kế toán): nhận notification phiếu YCVT đã
-- duyệt + tải PDF/Excel gửi thanh toán/NCC. Theo precedent 0049: ALTER TYPE
-- trong DO block (psql autocommit mỗi statement) rồi INSERT role row.
--
-- LƯU Ý: chạy qua `psql -f` KHÔNG bọc --single-transaction — ALTER TYPE ADD
-- VALUE phải commit trước khi INSERT dùng value mới.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'accountant'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
  ) THEN
    ALTER TYPE role_code ADD VALUE 'accountant';
  END IF;
END $$;

INSERT INTO app.role (code, display_name, description)
VALUES ('accountant', 'Bộ phận Kế toán',
        'Nhận thông báo phiếu YCVT đã duyệt, tải PDF/Excel gửi nhà cung cấp/thanh toán')
ON CONFLICT (code) DO NOTHING;
