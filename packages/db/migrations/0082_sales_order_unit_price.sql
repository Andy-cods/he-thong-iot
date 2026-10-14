-- =============================================================
-- 0082_sales_order_unit_price.sql   (V4.7 — Đơn giá bán cho Đơn hàng bán)
-- IDEMPOTENT. Áp STAGING / bản sao prod trước, rồi prod.
--
-- Bối cảnh: "Dự trù thu" ở Tổng quan Tài chính trước đây lấy đơn giá từ
-- Bảng sản xuất TV (production_board_item.unit_price). Chủ xưởng yêu cầu đổi
-- nguồn sang ĐƠN HÀNG BÁN (sales_order) — bảng thống kê đơn hàng thực.
-- Migration này bổ sung cột đơn giá bán để mỗi đơn có giá trị
-- (order_qty × unit_price) làm nguồn mới cho Dự trù thu.
--
-- DRIFT-NOTES: bảng có thể ở schema `app` (chuẩn) — thêm IF NOT EXISTS để
-- chạy lại an toàn.
-- =============================================================
ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS unit_price numeric(18, 4);

COMMENT ON COLUMN app.sales_order.unit_price IS
  'V4.7 — Đơn giá BÁN (VND/đơn vị). Giá trị đơn = order_qty × unit_price. NULL = chưa nhập giá.';
