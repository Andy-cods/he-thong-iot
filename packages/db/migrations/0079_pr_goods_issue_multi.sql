-- L8 (QA PR 12/10/2026) — cho phép XUẤT KHO NHIỀU ĐỢT cho 1 phiếu Đề xuất vật tư.
--
-- Bối cảnh: migration 0067 tạo UNIQUE INDEX goods_issue_pr_uk (purchase_request_id)
-- ép 1 PR ↔ tối đa 1 phiếu xuất. Thực tế Kho xuất từng đợt (xuất 2/6 hôm nay, phần
-- còn lại khi hàng về) nên phải bỏ ràng buộc duy nhất; thay bằng index thường để
-- tra "các phiếu xuất của PR" nhanh. Tổng đã xuất theo dòng PR lấy từ
-- goods_issue_line.purchase_request_line_id (cột đã có từ 0067) — KHÔNG cần cột mới.
--
-- Điều kiện "xuất đủ" kiểm ở tầng ứng dụng (markPRGoodsIssuedWithStock) trong
-- transaction khoá PR FOR UPDATE nên không có race ghi đôi.
--
-- Idempotent: chạy lại nhiều lần không lỗi. Chạy bằng user hethong_app.
-- Apply SAU 0067.

BEGIN;

SET search_path TO app, public;

DROP INDEX IF EXISTS app.goods_issue_pr_uk;

CREATE INDEX IF NOT EXISTS goods_issue_pr_idx
  ON app.goods_issue (purchase_request_id) WHERE purchase_request_id IS NOT NULL;

-- L14 — dọn thông báo của phiếu đã bị xoá (link 404, vẫn UNREAD). Từ nay route
-- DELETE phiếu tự xoá thông báo liên quan; đây là dọn dữ liệu cũ. Idempotent.
DELETE FROM app.notification n
WHERE n.entity_type = 'purchase_request'
  AND n.entity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM app.purchase_request p WHERE p.id = n.entity_id);

-- L15 — việc "chờ duyệt / cần tạo PO / nhắc" của phiếu đã xuất xong/hoàn tất hết ý nghĩa:
-- tự đánh dấu đã đọc (khớp RESOLVES_STALE mới cho PR_GOODS_ISSUED / PR_COMPLETED).
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_request p
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_request'
  AND n.entity_id = p.id
  AND p.goods_issued_at IS NOT NULL
  AND n.event_type IN ('PR_SUBMITTED', 'PR_DEPT_APPROVED', 'PR_APPROVED',
                       'PR_PENDING_REMINDER', 'PR_APPROVED_NO_PO_REMINDER');

COMMIT;
