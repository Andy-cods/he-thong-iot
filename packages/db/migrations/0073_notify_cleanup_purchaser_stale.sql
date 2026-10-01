-- =============================================================
-- 0073_notify_cleanup_purchaser_stale.sql
-- V4.4 fix P0 — "Dashboard 'Cần xử lý' purchaser lệch nặng so với chuông"
-- (plans/v4.4-ui/REGRESSION.md mục Phần 1 — C.purchaser FAIL).
--
-- NGUYÊN NHÂN GỐC: RESOLVES_STALE (notification-plans.ts) chỉ khớp theo
-- entity_id DUY NHẤT của chính sự kiện mới — nhưng PR_APPROVED ("Cần tạo
-- PO") gắn entity_id=PR trong khi sự kiện tạo PO (PO_CREATED_FROM_PR) gắn
-- entity_id=PO → KHÔNG BAO GIỜ khớp để tự hết hiệu lực. Tương tự
-- PO_CREATED_FROM_PR ("Cần nhập giá/gửi duyệt") chưa từng được liệt vào
-- RESOLVES_STALE của PO_APPROVAL_REQUESTED/PO_SENT/PO_CANCELLED/PO_CLOSED,
-- và PO_RECEIVED_FULL ("Kế toán: có thể tạo HĐ mua" — global action vì
-- categoryForEventType() suy theo eventType, không phân biệt được vai trò
-- người nhận) chưa từng hết hiệu lực khi đã tạo HĐ mua/đóng PO. Code đã sửa
-- (notification-plans.ts: resolveExtraEntityIds + RESOLVES_STALE mở rộng) —
-- migration này CHỈ dọn nợ CŨ đã tồn đọng trên staging trước khi code mới
-- deploy (xác nhận thật qua query trực tiếp lúc điều tra: 18/19 PR_APPROVED,
-- 14/17 PO_CREATED_FROM_PR, 6/12 PO_RECEIVED_FULL chưa đọc của e2e.purchaser
-- đã là việc ĐÃ XONG).
--
-- Idempotent — chỉ UPDATE read_at IS NULL, chạy lại không đổi gì thêm.
-- Áp trên STAGING qua đường hầm trước (KHÔNG prod).
-- =============================================================

-- (C1) PR_APPROVED ("Cần tạo PO: ... đã duyệt cuối") hết hiệu lực khi PR đã
-- có ít nhất 1 PO (purchase_order.pr_id) — việc tạo PO đã xong.
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_request pr
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_request'
  AND n.event_type = 'PR_APPROVED'
  AND n.entity_id = pr.id
  AND EXISTS (SELECT 1 FROM app.purchase_order po WHERE po.pr_id = pr.id);

-- (C2) PO_CREATED_FROM_PR ("... PO nháp mới — cần nhập giá/gửi duyệt") hết
-- hiệu lực khi PO không còn DRAFT (đã gửi duyệt/duyệt/gửi NCC/huỷ/đóng).
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_order po
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_order'
  AND n.event_type = 'PO_CREATED_FROM_PR'
  AND n.entity_id = po.id
  AND po.status <> 'DRAFT';

-- (C3) PO_RECEIVED_FULL ("... đã nhận đủ — Kế toán có thể tạo HĐ mua") hết
-- hiệu lực khi PO đã có HĐ mua (fin_invoice.purchase_order_id) hoặc PO đã
-- đóng (CLOSED) — việc liên quan đã xong, không còn là "cần xử lý".
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_order po
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_order'
  AND n.event_type = 'PO_RECEIVED_FULL'
  AND n.entity_id = po.id
  AND (
    po.status = 'CLOSED'
    OR EXISTS (SELECT 1 FROM app.fin_invoice fi WHERE fi.purchase_order_id = po.id)
  );
