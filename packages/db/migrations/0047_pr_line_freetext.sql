-- V3.7.72 — YCVT: cho phép nhập "Tên vật tư" + "Mã VT" tay (free-text).
--
-- Nguồn yêu cầu: user muốn cột "Tên vật tư" của mục II nhập tay,
-- không phải pick từ item master (case khi vật tư mới chưa có trong DB).
--
-- Thay đổi:
--   1. purchase_request_line.item_id: DROP NOT NULL — cho phép NULL khi
--      user gõ vật tư free-text chưa có trong master.
--   2. Thêm 2 cột text: item_name (Tên VT nhập tay) + item_sku (Mã VT nhập tay).
--   3. Constraint: itemId IS NOT NULL OR (item_name IS NOT NULL) — phải có
--      ít nhất tên để identify line.
--
-- Khi convert PR → PO: lines có item_id NULL phải được admin gán item_id
-- thực thụ TRƯỚC khi convert (block ở repo layer, V3.8+).
-- ============================================================================

ALTER TABLE app.purchase_request_line
  ALTER COLUMN item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS item_sku  VARCHAR(64);

COMMENT ON COLUMN app.purchase_request_line.item_id IS
  'V3.7.72 — Nullable. NULL khi user nhập tay tên VT chưa có trong item master.';
COMMENT ON COLUMN app.purchase_request_line.item_name IS
  'V3.7.72 YCVT — Tên vật tư nhập tay (fallback khi item_id NULL).';
COMMENT ON COLUMN app.purchase_request_line.item_sku IS
  'V3.7.72 YCVT — Mã VT nhập tay (fallback khi item_id NULL).';

-- Constraint: phải có ít nhất 1 trong 2 (itemId hoặc itemName) để identify line
ALTER TABLE app.purchase_request_line
  DROP CONSTRAINT IF EXISTS pr_line_identity_chk;
ALTER TABLE app.purchase_request_line
  ADD CONSTRAINT pr_line_identity_chk CHECK (
    item_id IS NOT NULL OR (item_name IS NOT NULL AND length(trim(item_name)) > 0)
  );

CREATE INDEX IF NOT EXISTS pr_line_item_name_idx
  ON app.purchase_request_line(item_name)
  WHERE item_id IS NULL;
