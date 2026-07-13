-- V3.10 — DNVT form: discriminator + 2 cột dòng (Tham khảo + Ngày giao hàng).
-- Additive, idempotent (IF NOT EXISTS). Không backfill: phiếu cũ mặc định 'MRF'
-- (đúng — chúng là mẫu YCVT/MRF). KHÔNG cần --single-transaction (chỉ ADD COLUMN).

ALTER TABLE app.purchase_request      ADD COLUMN IF NOT EXISTS form_type      varchar(16) NOT NULL DEFAULT 'MRF';
ALTER TABLE app.purchase_request_line ADD COLUMN IF NOT EXISTS reference_note varchar(64);
ALTER TABLE app.purchase_request_line ADD COLUMN IF NOT EXISTS delivery_date  date;

COMMENT ON COLUMN app.purchase_request.form_type IS
  'V3.10 — Loại phiếu trình bày: MRF (mẫu YCVT 5-section) | DNVT (mẫu GTAM/PRD-MRF-02). Backend chung.';
COMMENT ON COLUMN app.purchase_request_line.reference_note IS 'V3.10 DNVT — Cột "Tham khảo" (free-text ngắn, VD EC/VH).';
COMMENT ON COLUMN app.purchase_request_line.delivery_date  IS 'V3.10 DNVT — Cột "Ngày giao hàng".';
