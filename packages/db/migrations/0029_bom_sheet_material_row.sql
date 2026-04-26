-- ============================================================================
-- V2.0 Phase 2 Sprint 6 FIX — Migration 0029
--   bom_sheet_material_row: rows vật liệu per-BOM (giá deal, phôi, status, qty)
-- ----------------------------------------------------------------------------
-- Mỗi BOM List có sheet MATERIAL chứa N rows. Reference master_master qua
-- soft FK material_code (không hard FK để tránh block khi user nhập vật
-- liệu chưa có trong master — admin sẽ thêm vào master sau).
--
-- Data per-BOM (Q5 Option A — snapshot, không live-bind master):
--   - price_per_kg: giá deal cho project này (snapshot lúc import)
--   - blank_size jsonb: phôi cụ thể { l_mm, w_mm, t_mm, shape, qty_pcs }
--                      hoặc { freeText: "Tôn 30x152x60" }
--   - status 5-state riêng (Q4): PLANNED → ORDERED → DELIVERED → QC_PASS;
--     CANCELLED là state đặc biệt (đổi vật liệu giữa chừng).
--   - qty_kg, supplier_code, purchase_order_code (text, không FK PO line).
--
-- Optional component_line_id (Q2 Option A) link tới bom_line cụ thể —
-- NULL = vật liệu chung cho BOM, NOT NULL = phôi cho 1 component cụ thể.
-- Allow multiple rows per material_code (Q6 Option B) — vd 5 phôi AL6061
-- khác kích thước cho 5 component khác nhau.
--
-- Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §3 X1, §5.2
-- ============================================================================

SET search_path TO app, public;

-- ---------------------------------------------------------------------------
-- Enum 5-state status
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_row_status') THEN
    CREATE TYPE app.material_row_status AS ENUM (
      'PLANNED',    -- Đã lên kế hoạch, chưa đặt
      'ORDERED',    -- Đã tạo PO, chờ giao
      'DELIVERED',  -- NCC đã giao về kho
      'QC_PASS',    -- QC kiểm tra OK, sẵn sàng dùng
      'CANCELLED'   -- Hủy (đổi vật liệu giữa chừng, sai quy cách)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Bảng bom_sheet_material_row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.bom_sheet_material_row (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id           UUID NOT NULL REFERENCES app.bom_sheet(id) ON DELETE CASCADE,
  /** Soft FK tới material_master.code — không enforce hard FK. */
  material_code      VARCHAR(64),
  /** Override tên nếu khác master (quote khách yêu cầu tên riêng). */
  name_override      VARCHAR(255),
  /** Optional link tới bom_line cụ thể (NULL = chung BOM). */
  component_line_id  UUID REFERENCES app.bom_line(id) ON DELETE SET NULL,
  /** Giá deal project (snapshot từ master tại thời điểm import). */
  price_per_kg       NUMERIC(18,2),
  qty_kg             NUMERIC(18,4),
  /** Phôi: jsonb {l_mm, w_mm, t_mm, shape, qty_pcs} hoặc {freeText: "..."}. */
  blank_size         JSONB NOT NULL DEFAULT '{}'::jsonb,
  /** NCC dự kiến (text, không FK supplier để linh hoạt nhập tên). */
  supplier_code      VARCHAR(64),
  status             app.material_row_status NOT NULL DEFAULT 'PLANNED',
  /** Q7 Option A: text PO code, không FK PO line (defer Sprint 7). */
  purchase_order_code VARCHAR(64),
  notes              TEXT,
  position           INT NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_sheet_pos_idx
  ON app.bom_sheet_material_row (sheet_id, position);
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_material_code_idx
  ON app.bom_sheet_material_row (material_code)
  WHERE material_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_status_idx
  ON app.bom_sheet_material_row (status);
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_component_line_idx
  ON app.bom_sheet_material_row (component_line_id)
  WHERE component_line_id IS NOT NULL;

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_touch_updated_at') THEN
    DROP TRIGGER IF EXISTS tg_bom_sheet_material_row_touch ON app.bom_sheet_material_row;
    CREATE TRIGGER tg_bom_sheet_material_row_touch
      BEFORE UPDATE ON app.bom_sheet_material_row
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
  END IF;
END $$;

COMMENT ON TABLE app.bom_sheet_material_row IS
  'V2.0 Sprint 6 FIX — rows vật liệu per-BOM. Reference master_material qua material_code (soft FK), data per-BOM (price deal, phôi, status, qty, supplier).';

-- Verify
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM app.bom_sheet_material_row;
  RAISE NOTICE '[0029] bom_sheet_material_row created, current rows=%', v_count;
END $$;
