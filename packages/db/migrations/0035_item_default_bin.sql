-- V3.7 — Item slotting: gán bin mặc định cho mỗi SKU.
-- Khi nhận hàng (receiving), nếu không chỉ định bin → fallback default_bin_id.

-- ════════════════════════════════════════════════════════════════════
-- 1. Thêm cột default_bin_id vào item
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.item
  ADD COLUMN IF NOT EXISTS default_bin_id UUID
    REFERENCES app.location_bin(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS item_default_bin_idx ON app.item (default_bin_id);

-- ════════════════════════════════════════════════════════════════════
-- 2. Seed slotting kệ A-01 theo phương án đã duyệt (V3.7)
-- ════════════════════════════════════════════════════════════════════
-- Tầng 1 (0-2m): hot-pick + có tồn + heavy/long
UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-1-01' AND i.sku = 'KES6-20';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-1-02' AND i.sku = 'C1609-24-P-00154';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-1-03' AND i.sku = 'B6203ZZ';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-1-04' AND i.sku = 'STWN20';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-1-05' AND i.sku = 'C1609-24-P-00373';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-1-06'
    AND i.sku IN ('C1609-24-P-00125_MIR', 'C1609-24-P-00125_MIR_MIR');

-- Tầng 2 (2-4m): GTAM AL6061 batch 1
UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-2-01' AND i.sku = 'C1609-24-P-00376';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-2-02' AND i.sku = 'C1609-24-P-00377';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-2-03' AND i.sku = 'C1609-24-P-00378';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-2-04' AND i.sku = 'C1609-24-P-00379';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-2-05' AND i.sku = 'C1609-24-P-00380';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-2-06'
    AND i.sku IN ('C1609-24-P-00381', 'C1609-24-P-00436');

-- Tầng 3 (4-6m): slow-moving + GTAM batch 2
UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-3-01' AND i.sku = 'C1609-24-P-00386';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-3-02' AND i.sku = 'C1609-24-P-00387';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-3-03' AND i.sku = 'C1609-24-P-00394';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-3-04' AND i.sku = 'C1609-24-P-00395';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-3-05' AND i.sku = 'C1609-24-P-00393';

UPDATE app.item i SET default_bin_id = b.id
  FROM app.location_bin b
  WHERE b.full_code = 'A-01-3-06' AND i.sku = 'HTBN1800S5M-150_INFO-1-32-3';
