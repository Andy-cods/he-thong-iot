-- V4.0 Wave 1 — Role 'shareholder' (Cổ đông).
--
-- Quyền: READ-ONLY phân hệ Tài chính (thu chi / công nợ / dòng tiền) và tiến
-- độ gia công-sản xuất (production board). KHÔNG thấy BOM / đề xuất vật tư /
-- đơn mua / vật tư / nhà cung cấp / tồn kho.
--
-- Giám đốc KHÔNG có role riêng — dùng 'admin' sẵn có (quyết định của user).
--
-- Theo precedent 0049 (display) / 0050 (accountant): ALTER TYPE trong DO block
-- rồi INSERT role row.
--
-- LƯU Ý: chạy qua `psql -f` KHÔNG bọc --single-transaction — ALTER TYPE ADD
-- VALUE phải commit trước khi INSERT dùng value mới.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'shareholder'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
  ) THEN
    ALTER TYPE role_code ADD VALUE 'shareholder';
  END IF;
END $$;

INSERT INTO app.role (code, display_name, description)
VALUES ('shareholder', 'Cổ đông',
        'Xem báo cáo Tài chính (thu chi, công nợ, dòng tiền) và tiến độ sản xuất — READ-ONLY')
ON CONFLICT (code) DO NOTHING;

-- Verify
SELECT code, display_name FROM app.role WHERE code = 'shareholder';
