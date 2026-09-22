-- V4.0 Wave 3 Phase B — Mã tham chiếu duy nhất tự sinh cho từng dòng PR
-- (purchase_request_line). KHÁC `reference_code` cũ (free-text link/PO cũ/sản
-- phẩm NCC, KHÔNG unique, đã có dữ liệu thật) — cột mới `line_ref_code` là mã
-- ID hệ thống tự sinh, dùng để tra cứu duy nhất 1 dòng vật tư đề xuất.
--
-- Nullable — dòng PR cũ (tạo trước khi có tính năng này) giữ NULL, không bị
-- backfill (không cần thiết, YAGNI). Partial unique index cho phép nhiều NULL.

ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS line_ref_code VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS pr_line_ref_code_uk
  ON app.purchase_request_line (line_ref_code)
  WHERE line_ref_code IS NOT NULL;
