-- V4.1 Đợt 1b — Phiếu xuất kho (goods_issue) + giao phiếu yêu cầu vật tư qua kho.
--
-- Bối cảnh (plans/v4.1-audit-hoan-thien/AUDIT.md §2 Q3/KHO-04, DOT1_PLAN.md §1.5 + §2.2):
--   - Giao phiếu yêu cầu vật tư (material_request) trước đây CHỈ đổi trạng thái,
--     không trừ tồn, không chứng từ → tồn hệ thống cao hơn thực tế.
--   - Từ nay MỌI đường xuất (giao phiếu yêu cầu, xuất nhanh, duyệt yêu cầu xuất
--     kho ISR) sinh 1 phiếu xuất `PX-YYMM-NNNN` cùng transaction với
--     inventory_txn OUT_ISSUE (ref_table='goods_issue').
--   - material_request thêm trạng thái PARTIAL (giao từng phần).
--     ⚠ Khác plan: cột status CÓ CHECK từ 0033 (không có PARTIAL) → phải thay
--     CHECK, không phải "không cần DDL".
--   - CHECK NOT VALID: txn xuất (OUT_ISSUE/ADJUST_MINUS/ASSEMBLY_CONSUME) phải
--     có from_bin_id (KHO-02). NOT VALID → dữ liệu lịch sử không bị kiểm (D4:
--     đối soát bằng báo cáo, KHÔNG tự sửa), chỉ chặn dòng mới.
--
-- Idempotent: chạy lại nhiều lần không lỗi. Chạy bằng user hethong_app.
-- Apply SAU khi code Đợt 1a đã chạy trên prod, TRƯỚC khi deploy code 1b.

BEGIN;

SET search_path TO app, public;

-- ════════════════════════════════════════════════════════════════════
-- 1. goods_issue — header phiếu xuất kho
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.goods_issue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_no            VARCHAR(32) NOT NULL,
  source_type         VARCHAR(24) NOT NULL
                        CHECK (source_type IN ('MATERIAL_REQUEST','QUICK_ISSUE','ISSUE_REQUEST')),
  reason              VARCHAR(16) NOT NULL DEFAULT 'production'
                        CHECK (reason IN ('production','sales','manual','loss','return','other')),
  material_request_id UUID REFERENCES app.material_request(id),
  issue_request_id    UUID REFERENCES app.warehouse_issue_request(id),
  wo_id               UUID REFERENCES app.work_order(id),
  reference           VARCHAR(64),
  notes               TEXT,
  total_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  issued_by           UUID NOT NULL REFERENCES app.user_account(id),
  received_by         UUID REFERENCES app.user_account(id),
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_no_uk ON app.goods_issue (issue_no);
-- 1 yêu cầu xuất kho (ISR) ↔ tối đa 1 phiếu xuất → chặn duyệt 2 lần ở DB.
CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_isr_uk
  ON app.goods_issue (issue_request_id) WHERE issue_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS goods_issue_mr_idx ON app.goods_issue (material_request_id);
CREATE INDEX IF NOT EXISTS goods_issue_issued_at_idx ON app.goods_issue (issued_at DESC);
CREATE INDEX IF NOT EXISTS goods_issue_source_idx ON app.goods_issue (source_type, issued_at DESC);

COMMENT ON TABLE app.goods_issue IS
  'V4.1 Đợt 1b — Phiếu xuất kho PX-YYMM-NNNN. Mọi đường xuất (phiếu yêu cầu vật tư, xuất nhanh, duyệt ISR) sinh 1 phiếu, cùng transaction với inventory_txn OUT_ISSUE (ref_table=goods_issue).';

-- ════════════════════════════════════════════════════════════════════
-- 2. goods_issue_line — mỗi dòng ↔ đúng 1 inventory_txn (lô + bin)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.goods_issue_line (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_issue_id           UUID NOT NULL REFERENCES app.goods_issue(id) ON DELETE CASCADE,
  line_no                  INTEGER NOT NULL,
  item_id                  UUID NOT NULL REFERENCES app.item(id),
  lot_serial_id            UUID NOT NULL REFERENCES app.inventory_lot_serial(id),
  bin_id                   UUID NOT NULL REFERENCES app.location_bin(id),
  qty                      NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  inventory_txn_id         UUID NOT NULL REFERENCES app.inventory_txn(id),
  material_request_line_id UUID REFERENCES app.material_request_line(id),
  notes                    TEXT,
  CONSTRAINT goods_issue_line_uk UNIQUE (goods_issue_id, line_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_line_txn_uk ON app.goods_issue_line (inventory_txn_id);
CREATE INDEX IF NOT EXISTS goods_issue_line_item_idx ON app.goods_issue_line (item_id);
CREATE INDEX IF NOT EXISTS goods_issue_line_mrl_idx ON app.goods_issue_line (material_request_line_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. material_request.status — thêm PARTIAL (giao từng phần)
--    0033 tạo CHECK inline (tên tự sinh, thường material_request_status_check).
--    Bỏ MỌI CHECK cũ nhắc tới status rồi thêm CHECK có tên cố định.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'app.material_request'::regclass
       AND c.contype = 'c'
       AND c.conname <> 'material_request_status_ck'
       AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE app.material_request DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER TABLE app.material_request ADD CONSTRAINT material_request_status_ck
    CHECK (status IN ('PENDING','PICKING','READY','PARTIAL','DELIVERED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════
-- 4. inventory_txn xuất PHẢI có bin (KHO-02) — NOT VALID: không kiểm dữ liệu
--    lịch sử (xem báo cáo "Đối soát trước kiểm kê", D4), chỉ chặn dòng mới.
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE app.inventory_txn ADD CONSTRAINT inventory_txn_out_requires_bin
    CHECK (tx_type NOT IN ('OUT_ISSUE','ADJUST_MINUS','ASSEMBLY_CONSUME') OR from_bin_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
