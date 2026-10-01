-- V4.4.2 — Đơn giá bán cho mã hàng trên Bảng sản xuất, để Tài chính tính
-- "Đang sản xuất" (giá trị đơn hàng) và "Dự trù thu" (hàng hoàn thành chưa giao).
-- Chỉ THÊM cột nullable: code cũ không bị ảnh hưởng. Idempotent.
ALTER TABLE app.production_board_item
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,2);
COMMENT ON COLUMN app.production_board_item.unit_price IS
  'Đơn giá bán (VND/đơn vị). NULL = chưa nhập. Chỉ admin/kế toán/thu mua xem — không hiện trên TV xưởng.';
