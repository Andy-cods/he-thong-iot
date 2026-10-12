-- =============================================================
-- 0080_notification_info_backfill.sql
-- Lỗi giám thị lần 3 (N6) — thông báo PR CŨ gửi cho người nhận CHỈ-ĐỂ-BIẾT
-- vẫn mang event_type gốc (PR_APPROVED / PO_CREATED_FROM_PR) nên bị đếm vào
-- nhóm "Cần bạn duyệt" + badge, dù code hiện tại đã lưu `<TYPE>_INFO` cho họ
-- (storedEventType() trong notification-plans.ts).
--
-- LỰA CHỌN: xác định được chắc người nhận "cần làm" vs "để biết" nhờ TIÊU ĐỀ
-- do planPRApproved / planPRReopenedForPO / planPOCreatedFromPR phát ra
-- (mỗi người nhận một dòng riêng, tiêu đề khác nhau theo vai trò):
--   PR_APPROVED
--     - Thu mua (CẦN LÀM)      : "Cần tạo PO: …" / "Cần tạo lại PO: …"
--     - Người lập (để biết)    : "<mã> đã được duyệt"
--     - Kế toán (để biết)      : "Phiếu <mã> đã duyệt — tải PDF/Excel"
--   PO_CREATED_FROM_PR
--     - Thu mua (CẦN LÀM)      : "<n> PO nháp mới từ phiếu <mã>"
--     - Người lập (để biết)    : "Phiếu <mã> đã được lập <n> đơn mua hàng (PO)"
-- => đổi event_type của các dòng KHÔNG phải tiêu đề "cần làm" thành `<TYPE>_INFO`.
-- Vì xác định được chắc nên KHÔNG cần fallback "đánh đã đọc các bản > 7 ngày".
-- Đổi cả bản đã đọc để lịch sử nhất quán với code mới (không ảnh hưởng badge).
--
-- Idempotent — sau khi đổi, event_type không còn khớp điều kiện nên chạy lại
-- không đổi thêm gì. Chỉ DML trên app.notification (không DDL).
-- Chỉ viết file; áp trên STAGING trước, KHÔNG tự chạy trên prod.
-- =============================================================

UPDATE app.notification
SET event_type = 'PR_APPROVED_INFO'
WHERE event_type = 'PR_APPROVED'
  AND title NOT LIKE 'Cần tạo PO%'
  AND title NOT LIKE 'Cần tạo lại PO%';

UPDATE app.notification
SET event_type = 'PO_CREATED_FROM_PR_INFO'
WHERE event_type = 'PO_CREATED_FROM_PR'
  AND title NOT LIKE '% PO nháp mới từ phiếu %';
