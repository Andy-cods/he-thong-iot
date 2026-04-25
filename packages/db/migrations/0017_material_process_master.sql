-- ============================================================================
-- V2.0 Phase 2 Sprint 4 — Migration 0017
--   material_master + process_master + seed từ Excel sheet 3 (Material&Process)
-- ----------------------------------------------------------------------------
-- Bối cảnh: file Excel "Bản chính thức" sheet 3 chứa 2 master tables:
--   - Vật liệu (POM/AL6061/SUS304/...): code + tên EN + tên VN + giá/kg
--   - Quy trình (MCT/Milling/Anodizing/...): code + tên + giá/giờ (hoặc đặc
--     thù như "115đ/cm2" cho Anodizing)
--
-- Sau migration:
--   - Item form sẽ có dropdown chọn material_code (FK qua migration 0018).
--   - Cost calculator (phase 2 sau) sẽ join material+process để tính giá thành.
--   - Admin UI /admin/materials + /admin/processes CRUD.
--
-- User: hethong_app (owner). Idempotent: IF NOT EXISTS toàn bộ.
-- Refs: plans/redesign-v3/{brainstorm.md §5, addendum-user-answers.md §1.3,
--       implementation-plan.md P2-S4-T1}
-- ============================================================================

SET search_path TO app, public;

-- ---------------------------------------------------------------------------
-- Bảng 23a: material_master — master vật liệu (giá/kg).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.material_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(64)  NOT NULL,
  name_en         VARCHAR(255) NOT NULL,
  name_vn         VARCHAR(255) NOT NULL,
  -- Phân nhóm để filter UI: POM / PB108 / PVC / URETHANE / TEFLON / BAKELITE /
  -- MIKA / PC / PEEK / ULTEM / ALUMINIUM / COPPER / STEEL / STAINLESS_STEEL /
  -- DUROSTONE / PI108 / PE_FOAM / SILICON / TITAN / OTHER.
  category        VARCHAR(64),
  -- Giá/kg VND (NULL = chưa xác định).
  price_per_kg    NUMERIC(18,2),
  -- Mật độ kg/m3 (optional, dùng tính trọng lượng từ kích thước).
  density_kg_m3   NUMERIC(8,2),
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS material_master_code_uk
  ON app.material_master (code);
CREATE INDEX IF NOT EXISTS material_master_category_idx
  ON app.material_master (category);
CREATE INDEX IF NOT EXISTS material_master_active_idx
  ON app.material_master (is_active);

-- ---------------------------------------------------------------------------
-- Bảng 23b: process_master — master quy trình gia công (giá/giờ + đặc thù).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.process_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(64)  NOT NULL,
  name_en         VARCHAR(255) NOT NULL,
  name_vn         VARCHAR(255) NOT NULL,
  -- Giá/đơn vị tính (HOUR mặc định). NULL nếu chưa xác định hoặc đặc thù.
  price_per_unit  NUMERIC(18,2),
  -- Đơn vị: HOUR / CM2 / OTHER. Anodizing dùng CM2 (115đ/cm2) là đặc thù.
  pricing_unit    VARCHAR(32) NOT NULL DEFAULT 'HOUR',
  pricing_note    TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS process_master_code_uk
  ON app.process_master (code);
CREATE INDEX IF NOT EXISTS process_master_active_idx
  ON app.process_master (is_active);

-- ---------------------------------------------------------------------------
-- Trigger updated_at cho 2 bảng mới (theo pattern 0003c).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_touch_updated_at') THEN
    -- function đã có sẵn từ migration cũ → reuse
    DROP TRIGGER IF EXISTS tg_material_master_touch ON app.material_master;
    CREATE TRIGGER tg_material_master_touch
      BEFORE UPDATE ON app.material_master
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

    DROP TRIGGER IF EXISTS tg_process_master_touch ON app.process_master;
    CREATE TRIGGER tg_process_master_touch
      BEFORE UPDATE ON app.process_master
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SEED — 23 vật liệu + 11 quy trình từ Excel sheet 3 "Material&Process".
-- Idempotent: ON CONFLICT (code) DO NOTHING — chạy lại không nhân đôi.
-- ---------------------------------------------------------------------------
INSERT INTO app.material_master (code, name_en, name_vn, category, price_per_kg, density_kg_m3, notes)
VALUES
  -- POM family
  ('POM',          'POM',           'POM Thường',                       'POM',     125000, 1.41, NULL),
  ('POM_ESD_BLK',  'POM ESD BLACK', 'POM chống tĩnh điện (đen)',         'POM',     300000, 1.41, NULL),
  ('POM_ESD_WHT',  'POM ESD WHITE', 'POM chống tĩnh điện (trắng)',       'POM',     310000, 1.41, NULL),
  -- PB108 family
  ('PB108',        'PB108',         'PB108 thường',                      'PB108',   185000, 1.51, NULL),
  ('PB108_ESD_BLK','PB108 ESD Black','PB108 chống tĩnh điện (đen)',      'PB108',   312000, 1.51, NULL),
  ('PB108_ESD_WHT','PB108 ESD White','PB108 chống tĩnh điện (trắng)',    'PB108',   322000, 1.51, NULL),
  -- PVC
  ('PVC',          'PVC',           'PVC Thường',                       'PVC',      72000, 1.42, NULL),
  -- URETHANE
  ('URETHANE',     'URETHANE',      'URETHANE Thường',                  'URETHANE', 120000, 1.20, NULL),
  ('URETHANE_90',  'URETHANE 90',   'URETHANE độ cứng 90',              'URETHANE', 250000, 1.20, NULL),
  -- TEFLON
  ('TEFLON',       'TEFLON',        'TEFLON Thường',                    'TEFLON',   285000, 2.30, NULL),
  -- BAKELITE
  ('BAKELITE',     'BAKELITE',      'BAKELITE Thường',                  'BAKELITE', 100000, 1.51, NULL),
  ('BAKELITE_ESD', 'BAKELITE ESD',  'BAKELITE chống tĩnh điện',         'BAKELITE', 114000, 1.51, NULL),
  -- PC
  ('PC',           'PC',            'PC thường',                        'PC',       178000, 1.20, NULL),
  -- PEEK
  ('PEEK',         'PEEK',          'PEEK',                             'PEEK',    2600000, 1.32, 'Vật liệu kỹ thuật cao'),
  -- ALUMINIUM
  ('AL6061',       'AL6061',        'AL6061 (anode màu xám bạc)',       'ALUMINIUM',140000, 2.70, NULL),
  -- COPPER
  ('CU_BRASS',     'CU Brass',      'Cu (Đồng) Vàng / Đồng thau',       'COPPER',   320000, 8.96, NULL),
  -- STEEL
  ('S45C',         'S45C',          'S45C Thép',                        'STEEL',     60000, 7.85, NULL),
  ('SK5',          'SK5',           'SK5 Thép',                         'STEEL',    225000, 7.85, NULL),
  -- STAINLESS STEEL
  ('SUS201',       'SUS201',        'SUS201',                           'STAINLESS_STEEL', 60000, 7.80, NULL),
  ('SUS303',       'SUS303',        'SUS303',                           'STAINLESS_STEEL', 70000, 7.93, NULL),
  ('SUS304_20_40', 'SUS304 (20-40mm)', 'SUS304 (dày 20-40mm)',         'STAINLESS_STEEL',108000, 8.00, NULL),
  ('SUS304_10_20', 'SUS304 (10-20mm)', 'SUS304 (dày 10-20mm)',         'STAINLESS_STEEL', 98000, 8.00, NULL),
  ('SUS304_4_10',  'SUS304 (4-10mm)',  'SUS304 (dày 4-10mm)',          'STAINLESS_STEEL', 85000, 8.00, NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.process_master (code, name_en, name_vn, price_per_unit, pricing_unit, pricing_note)
VALUES
  ('MCT',           'MCT',           'Phay CNC (Machining Center)',  200000, 'HOUR', NULL),
  ('WIRE_CUTTING',  'Wire cutting',  'Cắt dây',                      150000, 'HOUR', NULL),
  ('MILLING',       'Milling',       'Phay',                         200000, 'HOUR', NULL),
  ('DRILLING',      'Drilling',      'Khoan',                        200000, 'HOUR', NULL),
  ('LATHE',         'Lathe',         'Tiện',                         200000, 'HOUR', NULL),
  ('GRINDING',      'Grinding',      'Mài',                          NULL,   'HOUR', NULL),
  ('LASER',         'Laser',         'Cắt laser',                    NULL,   'HOUR', NULL),
  ('SANDING',       'Sanding',       'Phun bi / cát (xử lý bề mặt)', NULL,   'HOUR', NULL),
  ('ASSEMBLY',      'Assembly',      'Lắp ráp',                      200000, 'HOUR', NULL),
  ('ANODIZING',     'Anodizing',     'Anode hoá',                    115,    'CM2',  '115đ/cm2 — tính theo diện tích bề mặt'),
  ('PACKING',       'Packing',       'Đóng gói',                     NULL,   'HOUR', NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verify counts (debug log).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_mat INT;
  v_proc INT;
BEGIN
  SELECT COUNT(*) INTO v_mat FROM app.material_master;
  SELECT COUNT(*) INTO v_proc FROM app.process_master;
  RAISE NOTICE '[0017] material_master=% rows, process_master=% rows', v_mat, v_proc;
END $$;
