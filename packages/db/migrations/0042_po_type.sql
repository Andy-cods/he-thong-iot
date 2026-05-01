-- V3.7.43 — Phân loại PO: COMMERCIAL vs SUBCONTRACT.
--
-- User feedback 2026-05-01: DDH-Mau template chỉ phù hợp cho PO gia công
-- ngoài (có cột "Vật liệu/Quy cách" + điều khoản "gia công đúng theo bản vẽ").
-- Hiện đang áp cho mọi PO là sai. Phân biệt qua po_type:
--   - COMMERCIAL: mua hàng có sẵn (Thương mại, vd MISUMI). PDF dùng template
--                 đơn giản (V3.8+ build).
--   - SUBCONTRACT: gia công ngoài (vd Tân Tiến, AMA). PDF dùng DDH-Mau form.
--
-- Idempotent: re-runnable safely.

-- 1. CREATE TYPE (idempotent via DO block)
DO $$ BEGIN
  CREATE TYPE app.purchase_order_type AS ENUM ('COMMERCIAL', 'SUBCONTRACT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. ADD COLUMN po_type (idempotent IF NOT EXISTS — PG 9.6+)
ALTER TABLE app.purchase_order
  ADD COLUMN IF NOT EXISTS po_type app.purchase_order_type
    NOT NULL DEFAULT 'COMMERCIAL';

CREATE INDEX IF NOT EXISTS purchase_order_type_idx
  ON app.purchase_order(po_type);

-- 3. ADD COLUMN spec cho PO line (Vật liệu/Quy cách dùng cho subcontract)
ALTER TABLE app.purchase_order_line
  ADD COLUMN IF NOT EXISTS spec VARCHAR(255);

COMMENT ON COLUMN app.purchase_order.po_type IS
  'Loai PO: COMMERCIAL (mua hang co san) | SUBCONTRACT (gia cong ngoai, dung DDH form)';
COMMENT ON COLUMN app.purchase_order_line.spec IS
  'Vat lieu/Quy cach (cho subcontract line): vd "SUS304 25x53x51mm"';
