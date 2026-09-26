-- V4.1 Đợt 1a — QC HOLD hàng nhận + guard xuất kho + công thức tồn chuẩn.
--
-- Bối cảnh (plans/v4.1-audit-hoan-thien/AUDIT.md §2, DOT1_PLAN.md §2.1):
--   - Hàng nhận vào kho trước đây AVAILABLE ngay cả khi "Chờ kiểm" → xuất được
--     hàng chưa QC. Từ nay lô mới nhận = HOLD + hold_code='QC_PENDING' cho tới
--     khi người có quyền QC bấm Đạt.
--   - Mỗi dòng phiếu nhập ↔ đúng 1 lô (lot_serial_id) + trạng thái QC riêng.
--   - View tồn chuẩn app.v_lot_stock / app.v_item_stock — MỘT công thức duy
--     nhất cho mọi màn hình (KHO-16).
--   - Trigger lưới an toàn: chặn OUT_ISSUE/ASSEMBLY_CONSUME/PROD_OUT vào lô
--     không AVAILABLE (ADJUST_MINUS không chặn — admin huỷ hàng HOLD, code chặn).
--
-- Quyết định D3: lô cũ giữ nguyên trạng thái (coi là đạt). Dòng phiếu nhập cũ
-- qc_status NULL = đạt, không hiện ở màn "Chờ QC".
--
-- Idempotent: chạy lại nhiều lần không lỗi. Chạy bằng user hethong_app.
-- PHẢI apply TRƯỚC khi deploy code Đợt 1a (code đọc cột/view mới).

BEGIN;

SET search_path TO app, public;

-- ════════════════════════════════════════════════════════════════════
-- 1. inventory_lot_serial.hold_code — lý do HOLD có cấu trúc
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.inventory_lot_serial ADD COLUMN IF NOT EXISTS hold_code VARCHAR(24);

DO $$ BEGIN
  ALTER TABLE app.inventory_lot_serial ADD CONSTRAINT inventory_lot_serial_hold_code_ck
    CHECK (hold_code IS NULL OR hold_code IN ('QC_PENDING','QC_FAIL','MANUAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill lô đang HOLD: HOLD do QC NG khi nhận → QC_FAIL; còn lại → MANUAL.
UPDATE app.inventory_lot_serial
   SET hold_code = CASE WHEN hold_reason ILIKE 'QC NG%' THEN 'QC_FAIL' ELSE 'MANUAL' END
 WHERE status = 'HOLD' AND hold_code IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 2. inbound_receipt_line — liên kết lô + QC theo dòng
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.inbound_receipt_line
  ADD COLUMN IF NOT EXISTS lot_serial_id UUID REFERENCES app.inventory_lot_serial(id),
  ADD COLUMN IF NOT EXISTS qc_status     VARCHAR(8),
  ADD COLUMN IF NOT EXISTS qc_checked_by UUID REFERENCES app.user_account(id),
  ADD COLUMN IF NOT EXISTS qc_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qc_notes      TEXT;

DO $$ BEGIN
  ALTER TABLE app.inbound_receipt_line ADD CONSTRAINT inbound_receipt_line_qc_status_ck
    CHECK (qc_status IS NULL OR qc_status IN ('PENDING','PASS','FAIL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS inbound_receipt_line_qc_pending_idx
  ON app.inbound_receipt_line (qc_status) WHERE qc_status IN ('PENDING','FAIL');
CREATE INDEX IF NOT EXISTS inbound_receipt_line_lot_idx
  ON app.inbound_receipt_line (lot_serial_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. Index ledger theo lô (view tồn + guard xuất đều lọc theo lot_serial_id)
-- ════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS inventory_txn_lot_idx ON app.inventory_txn (lot_serial_id);

-- ════════════════════════════════════════════════════════════════════
-- 4. View tồn chuẩn (KHO-16)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW app.v_lot_stock AS
SELECT l.id AS lot_serial_id,
       l.item_id,
       l.status,
       l.hold_code,
       l.lot_code,
       l.exp_date,
       l.created_at,
       s.on_hand,
       r.reserved,
       CASE WHEN l.status = 'AVAILABLE' THEN GREATEST(s.on_hand - r.reserved, 0) ELSE 0 END::numeric(18,4) AS issuable_qty
FROM app.inventory_lot_serial l
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(CASE
           WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
           WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
           ELSE 0 END), 0)::numeric(18,4) AS on_hand
  FROM app.inventory_txn t
  WHERE t.lot_serial_id = l.id
) s
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(rv.reserved_qty), 0)::numeric(18,4) AS reserved
  FROM app.reservation rv
  WHERE rv.lot_serial_id = l.id AND rv.status = 'ACTIVE'
) r;

CREATE OR REPLACE VIEW app.v_item_stock AS
SELECT item_id,
       COALESCE(SUM(on_hand), 0)::numeric(18,4)                                     AS on_hand_total,
       COALESCE(SUM(on_hand) FILTER (WHERE status = 'AVAILABLE'), 0)::numeric(18,4) AS on_hand_available,
       COALESCE(SUM(on_hand) FILTER (WHERE status = 'HOLD'), 0)::numeric(18,4)      AS hold_qty,
       COALESCE(SUM(reserved), 0)::numeric(18,4)                                    AS reserved,
       COALESCE(SUM(issuable_qty), 0)::numeric(18,4)                                AS issuable_qty
FROM app.v_lot_stock
GROUP BY item_id;

COMMENT ON VIEW app.v_lot_stock IS
  'V4.1 Đợt 1 — công thức tồn DUY NHẤT theo lô. issuable_qty = khả dụng xuất (chỉ AVAILABLE, trừ giữ chỗ ACTIVE).';
COMMENT ON VIEW app.v_item_stock IS
  'V4.1 Đợt 1 — tổng hợp app.v_lot_stock theo item. "Khả dụng" trên UI = issuable_qty (không bao giờ tính HOLD).';

-- ════════════════════════════════════════════════════════════════════
-- 5. Trigger lưới an toàn: không xuất/tiêu hao lô không AVAILABLE
--    Code luôn insert inventory_txn TRƯỚC rồi mới đánh dấu lô CONSUMED, nên
--    trigger không chặn nhầm lượt xuất hợp lệ cuối cùng của lô.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION app.trg_inventory_txn_lot_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  IF NEW.lot_serial_id IS NOT NULL
     AND NEW.tx_type IN ('OUT_ISSUE','ASSEMBLY_CONSUME','PROD_OUT') THEN
    SELECT status::text INTO v_status
      FROM app.inventory_lot_serial WHERE id = NEW.lot_serial_id;
    IF v_status IS DISTINCT FROM 'AVAILABLE' THEN
      RAISE EXCEPTION 'LOT_NOT_ISSUABLE: lô % đang %, không được xuất', NEW.lot_serial_id, v_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_txn_lot_guard ON app.inventory_txn;
CREATE TRIGGER inventory_txn_lot_guard BEFORE INSERT ON app.inventory_txn
  FOR EACH ROW EXECUTE FUNCTION app.trg_inventory_txn_lot_guard();

COMMIT;
