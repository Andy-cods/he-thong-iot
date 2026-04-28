-- V3.6 — Warehouse Location System
-- Mở rộng location_bin với cấu trúc Khu-Kệ-Ngăn-Ô + 3D coords + capacity.
-- View bin_inventory aggregate qty từ inventory_txn ledger (FIFO ready).

-- ════════════════════════════════════════════════════════════════════
-- 1. Extend location_bin với cấu trúc 4-thành-phần + 3D layout fields
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE app.location_bin
  ADD COLUMN IF NOT EXISTS area VARCHAR(8),         -- Khu (A, B, C...)
  ADD COLUMN IF NOT EXISTS rack VARCHAR(8),         -- Kệ (01, 02...)
  ADD COLUMN IF NOT EXISTS level_no SMALLINT,       -- Ngăn (1-3)
  ADD COLUMN IF NOT EXISTS position VARCHAR(8),     -- Ô (01-06)
  ADD COLUMN IF NOT EXISTS full_code VARCHAR(64),   -- A-01-2-03 (computed)
  ADD COLUMN IF NOT EXISTS capacity NUMERIC(18,4),  -- max units (NULL = unlimited)
  ADD COLUMN IF NOT EXISTS low_threshold NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coord_x NUMERIC(8,2),    -- vị trí render isometric (m)
  ADD COLUMN IF NOT EXISTS coord_y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS coord_z NUMERIC(8,2);

-- Backfill full_code cho các bin cũ (nếu zone/binCode đã có)
UPDATE app.location_bin
SET full_code = COALESCE(area || '-' || rack || '-' || level_no::text || '-' || position, zone || '/' || bin_code)
WHERE full_code IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS location_bin_full_code_idx ON app.location_bin (full_code);
CREATE INDEX IF NOT EXISTS location_bin_area_rack_idx ON app.location_bin (area, rack);

-- ════════════════════════════════════════════════════════════════════
-- 2. Putaway log — track gắn lot vào bin nào (history nhập kho có vị trí)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.warehouse_putaway (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_serial_id   UUID NOT NULL REFERENCES app.inventory_lot_serial(id),
  item_id         UUID NOT NULL REFERENCES app.item(id),
  bin_id          UUID NOT NULL REFERENCES app.location_bin(id),
  qty             NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  putaway_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  putaway_by      UUID REFERENCES app.user_account(id),
  receipt_id      UUID REFERENCES app.inbound_receipt(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS putaway_lot_idx     ON app.warehouse_putaway (lot_serial_id);
CREATE INDEX IF NOT EXISTS putaway_bin_idx     ON app.warehouse_putaway (bin_id);
CREATE INDEX IF NOT EXISTS putaway_item_idx    ON app.warehouse_putaway (item_id, putaway_at DESC);

-- ════════════════════════════════════════════════════════════════════
-- 3. View: bin_inventory — aggregate qty hiện tại theo (bin, item, lot)
-- Tính từ inventory_txn ledger (IN_RECEIPT + PROD_IN + ADJUST_PLUS - OUT_ISSUE - PROD_OUT - ADJUST_MINUS - ASSEMBLY_CONSUME)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW app.bin_inventory AS
WITH bin_movements AS (
  -- Inbound (to_bin_id)
  SELECT
    t.to_bin_id   AS bin_id,
    t.item_id,
    t.lot_serial_id,
    t.qty         AS in_qty,
    0::numeric    AS out_qty
  FROM app.inventory_txn t
  WHERE t.to_bin_id IS NOT NULL
    AND t.tx_type IN ('IN_RECEIPT', 'PROD_IN', 'ADJUST_PLUS', 'TRANSFER')

  UNION ALL

  -- Outbound (from_bin_id)
  SELECT
    t.from_bin_id AS bin_id,
    t.item_id,
    t.lot_serial_id,
    0::numeric    AS in_qty,
    t.qty         AS out_qty
  FROM app.inventory_txn t
  WHERE t.from_bin_id IS NOT NULL
    AND t.tx_type IN ('OUT_ISSUE', 'PROD_OUT', 'ADJUST_MINUS', 'ASSEMBLY_CONSUME', 'TRANSFER')
)
SELECT
  bm.bin_id,
  bm.item_id,
  bm.lot_serial_id,
  SUM(bm.in_qty - bm.out_qty) AS qty_on_hand
FROM bin_movements bm
WHERE bm.bin_id IS NOT NULL
GROUP BY bm.bin_id, bm.item_id, bm.lot_serial_id
HAVING SUM(bm.in_qty - bm.out_qty) > 0;

COMMENT ON VIEW app.bin_inventory IS
  'Tồn kho hiện tại theo (bin, item, lot) — aggregated từ inventory_txn. Chỉ row có qty_on_hand > 0.';

-- ════════════════════════════════════════════════════════════════════
-- 4. Seed sample warehouse layout — Khu A: 5 kệ × 3 ngăn × 6 ô = 90 bins
-- Chỉ insert nếu chưa có bin nào trong area='A'
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  rack_no   INT;
  lvl_no    INT;
  pos_no    INT;
  rack_str  VARCHAR(8);
  pos_str   VARCHAR(8);
  full_str  VARCHAR(64);
  has_a_zone BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM app.location_bin WHERE area = 'A') INTO has_a_zone;
  IF has_a_zone THEN
    RAISE NOTICE 'Khu A đã có bins, skip seed';
    RETURN;
  END IF;

  FOR rack_no IN 1..5 LOOP
    rack_str := lpad(rack_no::text, 2, '0');
    FOR lvl_no IN 1..3 LOOP
      FOR pos_no IN 1..6 LOOP
        pos_str := lpad(pos_no::text, 2, '0');
        full_str := 'A-' || rack_str || '-' || lvl_no::text || '-' || pos_str;

        INSERT INTO app.location_bin (
          warehouse_code, zone, bin_code,
          area, rack, level_no, position, full_code,
          capacity, low_threshold,
          coord_x, coord_y, coord_z,
          is_active
        )
        VALUES (
          'WH-01', 'A', full_str,
          'A', rack_str, lvl_no, pos_str, full_str,
          1000, 50,
          (rack_no - 1) * 1.5,                  -- x: kệ cách 1.5m
          (pos_no - 1) * 0.5,                   -- y: ô dọc kệ 0.5m
          (lvl_no - 1) * 0.8,                   -- z: ngăn cao 0.8m
          true
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded 90 bins for area A (5 kệ × 3 ngăn × 6 ô)';
END $$;
