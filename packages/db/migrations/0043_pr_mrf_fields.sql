-- V3.7.55 — Mở rộng Purchase Request theo form MRF (Material Request Form GTAM).
--
-- File mẫu: "01 . MẪU ĐỀ XUẤT MUA VẬT TƯ GTAM.xlsx" (sheet "Phiếu MRF").
-- Workflow phê duyệt nhiều bước CHƯA làm trong phase này (gác lại theo user).
--
-- ============================================================================
-- Header (purchase_request)
-- ============================================================================
ALTER TABLE app.purchase_request
  ADD COLUMN IF NOT EXISTS target_department VARCHAR(64),     -- "Kính gửi" / Bộ phận nhận PR
  ADD COLUMN IF NOT EXISTS proposing_department VARCHAR(64),  -- Bộ phận đề xuất
  ADD COLUMN IF NOT EXISTS request_reason TEXT;               -- Lý do đề xuất

COMMENT ON COLUMN app.purchase_request.target_department IS
  'MRF — Phòng/ban nhận đề xuất (VD: Phòng Mua hàng, Giám đốc).';
COMMENT ON COLUMN app.purchase_request.proposing_department IS
  'MRF — Bộ phận đề xuất mua (VD: Gia công, Thiết kế).';
COMMENT ON COLUMN app.purchase_request.request_reason IS
  'MRF — Lý do đề xuất (free text).';

-- ============================================================================
-- Line items (purchase_request_line)
-- ============================================================================
ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS specification VARCHAR(512),                  -- "Quy cách chi tiết" — VD "D6x50xL100"
  ADD COLUMN IF NOT EXISTS uom VARCHAR(16),                             -- "ĐVT" — Cái/Bộ/...
  ADD COLUMN IF NOT EXISTS priority VARCHAR(16) DEFAULT 'NORMAL',       -- URGENT / NORMAL / RESERVE
  ADD COLUMN IF NOT EXISTS category VARCHAR(32),                        -- TOOL / CONSUMABLE / MATERIAL / OTHER
  ADD COLUMN IF NOT EXISTS estimated_unit_price NUMERIC(18,2),          -- Đơn giá dự kiến
  ADD COLUMN IF NOT EXISTS reference_code VARCHAR(128),                 -- Mã tham chiếu (link/PO cũ)
  ADD COLUMN IF NOT EXISTS approved_qty NUMERIC(18,6);                  -- SL được duyệt (≤ qty)

-- Constraint check priority + category enum-like (text, lower DB cost than enum)
ALTER TABLE app.purchase_request_line
  DROP CONSTRAINT IF EXISTS pr_line_priority_chk;
ALTER TABLE app.purchase_request_line
  ADD CONSTRAINT pr_line_priority_chk CHECK (
    priority IS NULL OR priority IN ('URGENT', 'NORMAL', 'RESERVE')
  );

ALTER TABLE app.purchase_request_line
  DROP CONSTRAINT IF EXISTS pr_line_category_chk;
ALTER TABLE app.purchase_request_line
  ADD CONSTRAINT pr_line_category_chk CHECK (
    category IS NULL OR category IN ('TOOL', 'CONSUMABLE', 'MATERIAL', 'OTHER')
  );

CREATE INDEX IF NOT EXISTS pr_line_priority_idx ON app.purchase_request_line(priority);
CREATE INDEX IF NOT EXISTS pr_line_category_idx ON app.purchase_request_line(category);

COMMENT ON COLUMN app.purchase_request_line.specification IS
  'MRF — Quy cách chi tiết, VD "D6x50xL100", "Φ100 SS400".';
COMMENT ON COLUMN app.purchase_request_line.priority IS
  'MRF — Ưu tiên: URGENT (Khẩn) / NORMAL (Bình thường) / RESERVE (Dự phòng).';
COMMENT ON COLUMN app.purchase_request_line.category IS
  'MRF — Phân loại: TOOL (CCDC) / CONSUMABLE (Tiêu hao) / MATERIAL (Vật tư) / OTHER.';
COMMENT ON COLUMN app.purchase_request_line.estimated_unit_price IS
  'MRF — Đơn giá dự kiến (VND), tổng tiền = qty × estimated_unit_price.';
COMMENT ON COLUMN app.purchase_request_line.reference_code IS
  'MRF — Mã tham chiếu / link sản phẩm tham khảo từ NCC.';
COMMENT ON COLUMN app.purchase_request_line.approved_qty IS
  'MRF — SL được duyệt sau review (≤ qty đề xuất). NULL = chưa duyệt.';

-- ============================================================================
-- Verify
-- ============================================================================
DO $$
DECLARE
  pr_cols int;
  prl_cols int;
BEGIN
  SELECT COUNT(*) INTO pr_cols
    FROM information_schema.columns
    WHERE table_schema='app' AND table_name='purchase_request'
      AND column_name IN ('target_department','proposing_department','request_reason');
  SELECT COUNT(*) INTO prl_cols
    FROM information_schema.columns
    WHERE table_schema='app' AND table_name='purchase_request_line'
      AND column_name IN ('specification','uom','priority','category','estimated_unit_price','reference_code','approved_qty');

  IF pr_cols < 3 OR prl_cols < 7 THEN
    RAISE EXCEPTION 'Migration 0043 incomplete: pr_cols=% prl_cols=%', pr_cols, prl_cols;
  END IF;
  RAISE NOTICE 'migration 0043: PR header +3 cols, PR line +7 cols (MRF GTAM form)';
END $$;
