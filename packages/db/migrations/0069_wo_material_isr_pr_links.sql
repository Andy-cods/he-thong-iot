-- 0069_wo_material_isr_pr_links.sql
-- V4.4 — "Xin vật tư theo BOM" (WO→ISR/PR) + chọn lại lô khi ISR hụt + huỷ PR.
--
-- 3 nhóm thay đổi độc lập, gộp 1 file cho gọn nhưng KHÔNG bọc BEGIN/COMMIT vì
-- nhóm (1) là ALTER TYPE ... ADD VALUE — không được chạy trong transaction
-- dùng ngay giá trị mới, nên để mỗi statement autocommit riêng (đúng quy ước
-- đã dùng ở 0052_audit_action_catchup.sql / 0053_item_type_catchup.sql). Các
-- statement còn lại (ALTER TABLE ADD COLUMN/CONSTRAINT, CREATE INDEX) đều
-- IF NOT EXISTS / DO-block bắt duplicate_object → an toàn khi chạy lại nhiều
-- lần hoặc chạy xen kẽ với statement khác trong cùng lần apply.
--
-- Verify trước khi apply (đã chạy trên staging 2026-09-30): enum
-- purchase_request_status CHỈ tồn tại ở schema `app` (không có bản sao ở
-- `public`) — xem packages/db/DRIFT-NOTES.md mục 1. Vì vậy chỉ ALTER
-- app.purchase_request_status; nếu môi trường khác có thêm bản sao ở public,
-- chạy thêm 1 dòng tương tự cho public.purchase_request_status trước khi coi
-- migration này là xong ở môi trường đó.

-- ── (1) PR có thể HUỶ (Việc 4 — trước đây chỉ REJECTED hoặc xoá cứng) ──────
ALTER TYPE app.purchase_request_status ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ── (2) WO ↔ Yêu cầu xuất kho (ISR) — tham chiếu lệnh SX khi "Xin vật tư" ──
ALTER TABLE app.warehouse_issue_request ADD COLUMN IF NOT EXISTS wo_id UUID;

DO $$ BEGIN
  ALTER TABLE app.warehouse_issue_request ADD CONSTRAINT warehouse_issue_request_wo_fk
    FOREIGN KEY (wo_id) REFERENCES app.work_order(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS issue_request_wo_idx
  ON app.warehouse_issue_request (wo_id) WHERE wo_id IS NOT NULL;

COMMENT ON COLUMN app.warehouse_issue_request.wo_id IS
  'V4.4 — Lệnh SX nguồn khi ISR sinh từ "Xin vật tư theo BOM". NULL = ISR lập tay như trước (không đổi hành vi cũ).';

-- ── (3) PR ↔ WO (đề xuất mua phần thiếu khi "Xin vật tư theo BOM") ────────
ALTER TABLE app.purchase_request ADD COLUMN IF NOT EXISTS linked_wo_id UUID;

DO $$ BEGIN
  ALTER TABLE app.purchase_request ADD CONSTRAINT purchase_request_linked_wo_fk
    FOREIGN KEY (linked_wo_id) REFERENCES app.work_order(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS pr_linked_wo_idx
  ON app.purchase_request (linked_wo_id) WHERE linked_wo_id IS NOT NULL;

COMMENT ON COLUMN app.purchase_request.linked_wo_id IS
  'V4.4 — Lệnh SX nguồn khi PR sinh từ "Xin vật tư theo BOM" (phần thiếu phải mua). NULL = PR lập tay/nguồn khác như trước.';

-- ── (4) PR — cột riêng cho hành động Huỷ (tách khỏi rejected_* để không lẫn
--     ý nghĩa "bị từ chối bởi người duyệt" với "người tạo/admin tự huỷ") ──
ALTER TABLE app.purchase_request ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE app.purchase_request ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE app.purchase_request ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

DO $$ BEGIN
  ALTER TABLE app.purchase_request ADD CONSTRAINT purchase_request_cancelled_by_fk
    FOREIGN KEY (cancelled_by) REFERENCES app.user_account(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN app.purchase_request.cancelled_by IS
  'V4.4 — Huỷ phiếu (khác reject: người tạo hoặc admin tự huỷ khi chưa/ vừa duyệt xong mà chưa có PO), xem cancelPR().';
