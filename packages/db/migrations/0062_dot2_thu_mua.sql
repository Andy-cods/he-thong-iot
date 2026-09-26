-- V4.1 Đợt 2 — Thu mua (PR → PO → nhận hàng → HĐ mua).
--
-- 1) D7: mỗi PO chỉ 1 hoá đơn mua (fin_invoice IN) chưa huỷ — chốt chặn cuối
--    cho nút "Tạo HĐ mua từ PO" (code đã khoá PO FOR UPDATE + kiểm trước).
--    Cột fin_invoice.purchase_order_id ĐÃ có từ 0055a → không thêm cột.
--    Nếu dữ liệu cũ đã trùng (nhập tay) → bỏ qua tạo index, chỉ NOTICE (code vẫn chặn).
-- 2) TM-15/16: index tra nhanh SL QC không đạt theo dòng PO.
-- 3) Dashboard/BOM: PO tạo từ dòng BOM (trước Đợt 2) không lưu BOM nào →
--    backfill metadata.bomTemplateId/bomLineId từ audit_event CREATE.
--
-- Idempotent, chạy bằng hethong_app. Không đổi enum / cột.

BEGIN;

SET search_path TO app, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.fin_invoice
    WHERE purchase_order_id IS NOT NULL
      AND direction = 'IN'
      AND status <> 'CANCELLED'
    GROUP BY purchase_order_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE '0062: có PO gắn >1 hoá đơn mua chưa huỷ — bỏ qua fin_invoice_po_active_uk (code vẫn chặn trùng).';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_po_active_uk
      ON app.fin_invoice (purchase_order_id)
      WHERE purchase_order_id IS NOT NULL
        AND direction = 'IN'
        AND status <> 'CANCELLED';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inbound_receipt_line_po_line_fail_idx
  ON app.inbound_receipt_line (po_line_id)
  WHERE qc_status = 'FAIL';

-- Backfill PO ↔ BOM (chỉ PO chưa có bomTemplateId; audit CREATE ghi after_json.bomLineId).
UPDATE app.purchase_order po
   SET metadata = COALESCE(po.metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'bomLineId', src.bom_line_id::text,
                       'bomTemplateId', src.template_id::text)
  FROM (
    SELECT DISTINCT ON (ae.object_id)
           ae.object_id AS po_id,
           bl.id        AS bom_line_id,
           bl.template_id
    FROM app.audit_event ae
    JOIN app.bom_line bl
      ON bl.id::text = ae.after_json ->> 'bomLineId'
    WHERE ae.object_type = 'purchase_order'
      AND ae.action = 'CREATE'
      AND ae.after_json ? 'bomLineId'
      AND (ae.after_json ->> 'bomLineId') ~* '^[0-9a-f-]{36}$'
    ORDER BY ae.object_id, ae.occurred_at
  ) src
 WHERE po.id = src.po_id
   AND NOT (COALESCE(po.metadata, '{}'::jsonb) ? 'bomTemplateId');

COMMIT;
