-- V4.2 (TASK "Trừ tồn luôn" khi PR "Đã xuất kho") — liên kết goods_issue ↔ purchase_request.
--
-- Bối cảnh: mark-issued (PR timeline IV.4) trước đây CHỈ ghi mốc goods_issued_at,
-- không trừ tồn → Kho phải xuất lại lần 2 ở Sơ đồ kho → tồn lệch. Từ nay nút
-- "Đã xuất kho" mở form chọn lô/bin từng dòng → tạo phiếu xuất `app.goods_issue`
-- (hạ tầng có sẵn từ Đợt 1b, migration 0060) CÙNG lúc với set goods_issued_at,
-- dùng chung assertIssuable/postOutboundTxns/genDocNo — không có logic tồn mới.
--
-- Cột thêm:
--   - goods_issue.purchase_request_id       — nguồn PR (như material_request_id/issue_request_id).
--   - goods_issue_line.purchase_request_line_id — dòng PR ↔ dòng phiếu xuất (như material_request_line_id).
--   - source_type CHECK mở rộng thêm 'PURCHASE_REQUEST'.
-- 1 PR chỉ xuất 1 lần (thiết kế "một thao tác, không lệch", không giao từng
-- phần như material_request) → unique index giống goods_issue_isr_uk.
--
-- Idempotent: chạy lại nhiều lần không lỗi. Chạy bằng user hethong_app.
-- Apply SAU 0059+0060 (cần bảng app.goods_issue đã tồn tại).

BEGIN;

SET search_path TO app, public;

-- ════════════════════════════════════════════════════════════════════
-- 1. goods_issue.purchase_request_id — nguồn PR, 1 PR ↔ tối đa 1 phiếu xuất.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.goods_issue
  ADD COLUMN IF NOT EXISTS purchase_request_id UUID REFERENCES app.purchase_request(id);

CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_pr_uk
  ON app.goods_issue (purchase_request_id) WHERE purchase_request_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 2. goods_issue_line.purchase_request_line_id — trace dòng PR ↔ dòng phiếu xuất.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.goods_issue_line
  ADD COLUMN IF NOT EXISTS purchase_request_line_id UUID REFERENCES app.purchase_request_line(id);

CREATE INDEX IF NOT EXISTS goods_issue_line_prl_idx
  ON app.goods_issue_line (purchase_request_line_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. source_type — thêm 'PURCHASE_REQUEST'. CHECK inline 0060 tên tự sinh
--    (thường goods_issue_source_type_check) → bỏ mọi CHECK cũ nhắc source_type
--    rồi thêm CHECK tên cố định (cùng mẫu 0060 §3 cho material_request.status).
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'app.goods_issue'::regclass
       AND c.contype = 'c'
       AND c.conname <> 'goods_issue_source_type_ck'
       AND pg_get_constraintdef(c.oid) ILIKE '%source_type%'
  LOOP
    EXECUTE format('ALTER TABLE app.goods_issue DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER TABLE app.goods_issue ADD CONSTRAINT goods_issue_source_type_ck
    CHECK (source_type IN ('MATERIAL_REQUEST','QUICK_ISSUE','ISSUE_REQUEST','PURCHASE_REQUEST'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
