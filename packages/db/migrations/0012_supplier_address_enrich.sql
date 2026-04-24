-- ============================================================================
-- V1.9 Phase 7: Supplier detail enrich — địa chỉ cấu trúc + ngân hàng + liên hệ
-- ----------------------------------------------------------------------------
-- User yêu cầu: thấy rõ NCC cung cấp vật liệu gì, khu gia (khu vực) ở đâu.
-- Bổ sung các cột idempotent (IF NOT EXISTS) vào app.supplier:
--   1. region / city / ward / street_address — địa chỉ cấu trúc.
--   2. factory_address — địa chỉ nhà máy (khác văn phòng).
--   3. latitude / longitude — geo optional cho Google Maps.
--   4. website / tax_code_extended — info cty (tax_code đã có).
--   5. bank_info JSONB — {name, account, branch}.
--   6. payment_terms — điều khoản thanh toán (Net 30, COD, ...).
--   7. contact_persons JSONB — array {name, role, phone, email, notes}.
--   8. internal_notes — ghi chú nội bộ (admin only).
-- Không đụng bất kỳ dữ liệu cũ nào. Giữ address TEXT cũ làm fallback.
-- ============================================================================

ALTER TABLE app.supplier
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ward VARCHAR(100),
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS factory_address TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bank_info JSONB,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contact_persons JSONB,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Index region để filter trong list supplier (Bắc/Trung/Nam hoặc tỉnh).
CREATE INDEX IF NOT EXISTS supplier_region_idx
  ON app.supplier (region)
  WHERE region IS NOT NULL;

COMMENT ON INDEX app.supplier_region_idx IS
  'V1.9 P7: filter NCC theo khu vực (region).';

COMMENT ON COLUMN app.supplier.region IS
  'Vùng địa lý (Bắc/Trung/Nam) hoặc mã tỉnh. Dùng để filter + group NCC.';
COMMENT ON COLUMN app.supplier.bank_info IS
  'JSONB {name, account, branch} — thông tin ngân hàng thanh toán NCC.';
COMMENT ON COLUMN app.supplier.contact_persons IS
  'JSONB array [{name, role, phone, email, notes}] — danh sách người liên hệ.';
