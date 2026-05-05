-- V3.7.58 — Mở rộng Work Order theo form LSX (Lệnh Sản Xuất GTAM).
-- File mẫu: "07 . LSX.xlsx" (sheet "Lenh_San_Xuat_GTAM 02").
--
-- Section VII (xác nhận liên bộ phận) + VIII (4 chữ ký phê duyệt) gác phase 3.
-- ============================================================================
ALTER TABLE app.work_order
  ADD COLUMN IF NOT EXISTS order_type VARCHAR(32) DEFAULT 'NEW',          -- NEW (Sản xuất mới) / REPAIR (Sửa chữa) / TRIAL (Thí nghiệm)
  ADD COLUMN IF NOT EXISTS creator_department VARCHAR(64),                -- Bộ phận lập (Kế hoạch SX, Thiết kế, Gia công...)
  ADD COLUMN IF NOT EXISTS tools_required JSONB DEFAULT '[]'::jsonb,      -- Dao cụ/CCDC array
  ADD COLUMN IF NOT EXISTS product_specification JSONB DEFAULT '{}'::jsonb; -- Kích thước + YC kỹ thuật

-- Constraint check order_type enum-like
ALTER TABLE app.work_order
  DROP CONSTRAINT IF EXISTS wo_order_type_chk;
ALTER TABLE app.work_order
  ADD CONSTRAINT wo_order_type_chk CHECK (
    order_type IS NULL OR order_type IN ('NEW', 'REPAIR', 'TRIAL')
  );

CREATE INDEX IF NOT EXISTS wo_order_type_idx ON app.work_order(order_type);

COMMENT ON COLUMN app.work_order.order_type IS
  'LSX — Loại lệnh: NEW (Sản xuất mới) / REPAIR (Sửa chữa) / TRIAL (Thí nghiệm).';
COMMENT ON COLUMN app.work_order.creator_department IS
  'LSX — Bộ phận lập (Kế hoạch SX / Thiết kế / Gia công).';
COMMENT ON COLUMN app.work_order.tools_required IS
  'LSX — Section VI: array dao cụ/CCDC. Mỗi item: {name, code, machine, qty, uom, status, notes}.';
COMMENT ON COLUMN app.work_order.product_specification IS
  'LSX — Section I: object {dimensions, technicalRequirements, notes} cho sản phẩm output.';

-- ============================================================================
-- Verify
-- ============================================================================
DO $$
DECLARE wo_cols int;
BEGIN
  SELECT COUNT(*) INTO wo_cols
    FROM information_schema.columns
    WHERE table_schema='app' AND table_name='work_order'
      AND column_name IN ('order_type','creator_department','tools_required','product_specification');
  IF wo_cols < 4 THEN
    RAISE EXCEPTION 'Migration 0044 incomplete: wo_cols=%', wo_cols;
  END IF;
  RAISE NOTICE 'migration 0044: WO +4 cols (LSX form GTAM)';
END $$;
