-- =============================================================
-- 0070_notify_category_and_push.sql
-- TASK-notify V4.4 — bảng lưu Web Push subscription theo user.
-- Idempotent — chạy lại nhiều lần không lỗi.
-- Áp trên STAGING qua đường hầm (KHÔNG prod) trước khi merge.
--
-- LƯU Ý VẬN HÀNH: nhóm "Cần bạn duyệt / Cập nhật / Nhắc hạn" ở chuông/trang
-- thông báo (bell + /notifications) được TÍNH TỪ event_type lúc đọc
-- (categoryForEventType() thuần trong notification-plans.ts), KHÔNG lưu cột
-- category riêng trong bảng notification — cố tình tránh ALTER TABLE lên
-- bảng notification (owner `hethong_app`; role vận hành/staging thông thường
-- chỉ có DML, không có DDL trên bảng đã tồn tại) — xác nhận thực tế khi áp
-- migration này: `ALTER TABLE app.notification ...` bị từ chối trên STAGING
-- với role `staging_app` — "must be owner of table notification"). Việc suy
-- luận theo event_type là coarse-grained (không phân biệt được 2 người nhận
-- khác vai trò của CÙNG 1 sự kiện, vd PR_APPROVED báo cả Thu mua "cần tạo PO"
-- lẫn người lập "chỉ để biết") nhưng tránh được yêu cầu quyền DDL và đủ đúng
-- cho > 90% trường hợp — xem plans/v4.4-notify/NOTIFY_MATRIX.md mục hạn chế.

-- push_subscription — Web Push (VAPID) theo user, nhiều thiết bị/user. Bảng
-- MỚI hoàn toàn (không ALTER bảng có sẵn) nên `staging_app` (hoặc bất kỳ role
-- có quyền CREATE trên schema `app`) tạo được — đã xác nhận thực tế.
CREATE TABLE IF NOT EXISTS app.push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.user_account(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscription_user_idx
  ON app.push_subscription(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint_uk
  ON app.push_subscription(endpoint);
