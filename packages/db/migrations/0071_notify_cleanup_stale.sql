-- =============================================================
-- 0071_notify_cleanup_stale.sql
-- TASK-notify V4.4 — dọn "hộp thư dồn": (A) gộp bản trùng cùng người/cùng
-- loại/cùng chứng từ chưa đọc, (B) tự đánh dấu đã đọc thông báo "chờ xử lý"
-- đã lỗi thời (chứng từ đã qua bước đó nhưng người nhận chưa bấm vào để đọc).
-- Idempotent — chạy lại không đổi gì thêm (chỉ UPDATE read_at IS NULL).
-- Áp trên STAGING qua đường hầm (KHÔNG prod).
-- =============================================================

-- (A) Cùng recipient_user + event_type + entity_id có > 1 dòng CHƯA đọc →
-- giữ dòng mới nhất, các dòng cũ hơn coi là đã bị thay thế → đánh dấu đã đọc.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY recipient_user, event_type, entity_id
           ORDER BY created_at DESC
         ) AS rn
  FROM app.notification
  WHERE read_at IS NULL
    AND recipient_user IS NOT NULL
    AND entity_id IS NOT NULL
)
UPDATE app.notification n
SET read_at = now()
FROM ranked r
WHERE n.id = r.id AND r.rn > 1;

-- (B1) PR_SUBMITTED / PR_PENDING_REMINDER hết hiệu lực khi phiếu không còn
-- chờ Kho duyệt bước 2 (approval_step đã đi tiếp hoặc phiếu đã bị từ chối).
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_request pr
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_request'
  AND n.event_type IN ('PR_SUBMITTED', 'PR_PENDING_REMINDER')
  AND n.entity_id = pr.id
  AND pr.approval_step <> 'SUBMITTED';

-- (B2) PR_DEPT_APPROVED hết hiệu lực khi phiếu không còn chờ Giám đốc duyệt
-- cuối (đã duyệt xong / bị từ chối).
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_request pr
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_request'
  AND n.event_type = 'PR_DEPT_APPROVED'
  AND n.entity_id = pr.id
  AND pr.approval_step <> 'DEPT_APPROVED';

-- (B3) PR_APPROVED_NO_PO_REMINDER hết hiệu lực khi PR đã có PO hoặc không
-- còn ở trạng thái APPROVED.
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_request pr
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_request'
  AND n.event_type = 'PR_APPROVED_NO_PO_REMINDER'
  AND n.entity_id = pr.id
  AND (
    pr.status <> 'APPROVED'
    OR EXISTS (SELECT 1 FROM app.purchase_order po WHERE po.pr_id = pr.id)
  );

-- (B4) PO_APPROVAL_REQUESTED / PO_SUBCONTRACT_DRAFT hết hiệu lực khi PO
-- không còn chờ duyệt (metadata.approvalStatus rời "pending") hoặc đã rời
-- DRAFT (đã gửi NCC / huỷ / đóng).
UPDATE app.notification n
SET read_at = now()
FROM app.purchase_order po
WHERE n.read_at IS NULL
  AND n.entity_type = 'purchase_order'
  AND n.event_type IN ('PO_APPROVAL_REQUESTED', 'PO_SUBCONTRACT_DRAFT')
  AND n.entity_id = po.id
  AND (
    COALESCE(po.metadata ->> 'approvalStatus', '') <> 'pending'
    OR po.status <> 'DRAFT'
  );

-- (B5) WO_REQUEST_SUBMITTED hết hiệu lực khi WO không còn DRAFT (đã duyệt
-- hoặc bị huỷ/từ chối).
UPDATE app.notification n
SET read_at = now()
FROM app.work_order wo
WHERE n.read_at IS NULL
  AND n.entity_type = 'work_order'
  AND n.event_type = 'WO_REQUEST_SUBMITTED'
  AND n.entity_id = wo.id
  AND wo.status <> 'DRAFT';

-- (B6) ISSUE_REQUEST_NEW hết hiệu lực khi phiếu không còn PENDING (đã duyệt
-- + xuất kho, hoặc bị từ chối).
UPDATE app.notification n
SET read_at = now()
FROM app.warehouse_issue_request r
WHERE n.read_at IS NULL
  AND n.entity_type = 'warehouse_issue_request'
  AND n.event_type = 'ISSUE_REQUEST_NEW'
  AND n.entity_id = r.id
  AND r.status <> 'PENDING';

-- (B7) DELIVERY_NOTE_CREATED hết hiệu lực khi phiếu không còn chờ Giám đốc
-- duyệt (đã thành BBGH chính thức hoặc bị từ chối).
UPDATE app.notification n
SET read_at = now()
FROM app.delivery_note d
WHERE n.read_at IS NULL
  AND n.entity_type = 'delivery_note'
  AND n.event_type = 'DELIVERY_NOTE_CREATED'
  AND n.entity_id = d.id
  AND d.status <> 'PENDING_APPROVAL';

-- (B8) PO_INVOICE_DRAFT hết hiệu lực khi hoá đơn không còn ở trạng thái nháp
-- (Kế toán đã xác nhận ghi công nợ hoặc đã huỷ).
UPDATE app.notification n
SET read_at = now()
FROM app.fin_invoice inv
WHERE n.read_at IS NULL
  AND n.entity_type = 'fin_invoice'
  AND n.event_type = 'PO_INVOICE_DRAFT'
  AND n.entity_id = inv.id
  AND inv.status <> 'DRAFT';
