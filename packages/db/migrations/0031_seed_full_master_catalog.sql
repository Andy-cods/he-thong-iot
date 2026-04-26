-- ============================================================================
-- V2.0 Phase 2 Sprint 6 — Migration 0031
--   Seed FULL master catalog từ Excel "Bản chính thức" sheet 3 Material&Process
-- ----------------------------------------------------------------------------
-- User feedback (2026-04-26): "tôi cần bạn thêm đủ 100% thông tin như excel
-- ở sheet material cho tôi nhé"
--
-- Bổ sung material_master + process_master từ ~25 → ~60 materials và ~11 →
-- ~20 processes. Migration 0017 đã seed 23+11; migration này thêm phần còn lại.
--
-- Categories materials Excel:
--   POM (3 variants ESD), PB108 (3 variants), PM107, MC501, PVC (2),
--   URETHANE (5), TEFLON (2), BAKELITE (2), MIKA (2), PC (3), PEEK,
--   ULTEM (2), ALUMINIUM (3), COPPER (3), STEEL (~22), STAINLESS_STEEL (6),
--   DUROSTONE, PI108, PE_FOAM, SILICON (3), TITAN.
--
-- Processes Excel: thêm Grinding, Laser, Urethane (proc), Sanding, Measure,
-- Coating, Mold, Heating Silicon, Plating, HRC, DLC.
--
-- Idempotent: ON CONFLICT (code) DO NOTHING — chạy lại an toàn.
-- Refs: user feedback 2026-04-26 + Excel sheet 3 screenshots
-- ============================================================================

SET search_path TO app, public;

-- ---------------------------------------------------------------------------
-- 1) MATERIALS — bổ sung phần còn thiếu so với migration 0017
-- ---------------------------------------------------------------------------

INSERT INTO app.material_master (code, name_en, name_vn, category, price_per_kg, density_kg_m3, notes) VALUES
  -- PM107 / MC501 (chống tĩnh điện đặc biệt)
  ('PM107',         'PM107',        'PM107-B Chống tĩnh điện',           'OTHER',           NULL,    NULL,  NULL),
  ('MC501',         'MC501',        'Nhựa MC501 Chống Tĩnh Điện',        'OTHER',           NULL,    NULL,  NULL),

  -- PVC ESD
  ('PVC_ESD',       'PVC ESD',      'PVC chống tĩnh điện',               'PVC',             NULL,    1.42,  NULL),

  -- URETHANE variants
  ('URETHANE_ESD',  'URETHANE ESD', 'URETHANE chống tĩnh điện',          'URETHANE',        NULL,    1.20,  NULL),
  ('URETHANE_50',   'URETHANE 50',  'URETHANE độ cứng 50',                'URETHANE',        NULL,    1.20,  NULL),
  ('URETHANE_70',   'URETHANE 70',  'URETHANE độ cứng 70',                'URETHANE',        NULL,    1.20,  NULL),

  -- TEFLON ESD
  ('TEFLON_ESD',    'TEFLON ESD',   'TEFLON chống tĩnh điện',            'TEFLON',          NULL,    2.30,  NULL),

  -- MIKA family
  ('MIKA',          'MIKA',         'MICA Thường',                        'MIKA',            NULL,    NULL,  NULL),
  ('MIKA_ESD',      'MIKA ESD',     'MICA chống tĩnh điện',              'MIKA',            NULL,    NULL,  NULL),

  -- PC variants
  ('PC_ESD',        'PC ESD',       'PC chống tĩnh điện',                'PC',              NULL,    1.20,  NULL),
  ('PC_GF20',       'PC GF20',      'PC GF20 (gia cường sợi thuỷ tinh)', 'PC',              NULL,    1.27,  NULL),

  -- ULTEM family
  ('ULTEM',         'ULTEM',        'UL TEM thường',                     'ULTEM',           NULL,    1.27,  NULL),
  ('ULTEM_1000',    'ULTEM 1000',   'UL TEM 1000',                       'ULTEM',           NULL,    1.27,  NULL),

  -- ALUMINIUM extras
  ('AL7075',        'AL7075',       'AL7075 (Aluminium 7075)',           'ALUMINIUM',       NULL,    2.81,  NULL),
  ('AL5052',        'AL5052',       'AL5052 (Aluminium 5052)',           'ALUMINIUM',       NULL,    2.68,  NULL),

  -- COPPER variants
  ('CU_COPPER',     'CU Copper',    'Cu (Đồng) Đỏ',                      'COPPER',          NULL,    8.96,  NULL),
  ('CU_BRONZE',     'CU Bronze',    'Cu (Đồng) Xám, Đen',                'COPPER',          NULL,    8.80,  NULL),

  -- STEEL family (~22 grades)
  ('SK4',           'SK4',          'SK4',                                'STEEL',           NULL,    7.85,  NULL),
  ('SKH51',         'SKH51',        'SKH51',                              'STEEL',           NULL,    8.16,  NULL),
  ('SM20C',         'SM20C',        'SM20C',                              'STEEL',           NULL,    7.85,  NULL),
  ('SM45C',         'SM45C',        'SM45C',                              'STEEL',           NULL,    7.85,  NULL),
  ('SM55C',         'SM55C',        'SM55C',                              'STEEL',           NULL,    7.85,  NULL),
  ('SS400',         'SS400',        'SS400 (Thép kết cấu)',              'STEEL',           NULL,    7.85,  NULL),
  ('STAVAX',        'STAVAX',       'STAVAX (Thép khuôn)',               'STEEL',           NULL,    7.80,  NULL),
  ('SKD11',         'SKD11',        'SKD11 (Thép khuôn lạnh)',           'STEEL',           NULL,    7.70,  NULL),
  ('SKD61',         'SKD61',        'SKD61 (Thép khuôn nóng)',           'STEEL',           NULL,    7.80,  NULL),
  ('STD11',         'STD11',        'STD11',                              'STEEL',           NULL,    7.70,  NULL),
  ('STD61',         'STD61',        'STD61',                              'STEEL',           NULL,    7.80,  NULL),
  ('MC901',         'MC901',        'MC901',                              'STEEL',           NULL,    1.16,  NULL),
  ('KP4M',          'KP4M',         'KP4M',                               'STEEL',           NULL,    7.85,  NULL),
  ('HSS',           'HSS',          'Thép HSS / thép gió',               'STEEL',           NULL,    8.10,  NULL),
  ('SUJ_2',         'SUJ-2',        'Thép SUJ2 (JIS G4805 Nhật Bản)',    'STEEL',           NULL,    7.85,  NULL),

  -- STAINLESS STEEL extra
  ('SUS316',        'SUS316',       'SUS316',                             'STAINLESS_STEEL', NULL,    7.99,  NULL),

  -- Đặc biệt
  ('DUROSTONE',     'Durostone',    'Đá cách nhiệt',                     'DUROSTONE',       NULL,    NULL,  NULL),
  ('PI108',         'PI108',        'Nhựa PI108',                        'PI108',           NULL,    NULL,  NULL),
  ('PE_FOAM',       'PE Foam',      'PE Foam (xốp PE)',                  'PE_FOAM',         NULL,    NULL,  NULL),

  -- SILICON family
  ('SILICON',       'Silicon',      'Silicon (chung)',                   'SILICON',         NULL,    1.10,  NULL),
  ('SILICON_40',    'Silicon 40',   'Ống silicon độ cứng 40',           'SILICON',         NULL,    1.10,  NULL),
  ('SILICON_45',    'Silicon 45',   'Ống silicon độ cứng 45',           'SILICON',         NULL,    1.10,  NULL),

  -- TITAN
  ('TITAN',         'Titan',        'Titan',                              'TITAN',           NULL,    4.51,  NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) PROCESSES — bổ sung phần còn thiếu
-- ---------------------------------------------------------------------------

INSERT INTO app.process_master (code, name_en, name_vn, price_per_unit, pricing_unit, pricing_note) VALUES
  ('GRINDING',       'Grinding',       'Mài',                              NULL,   'HOUR', NULL),
  ('LASER',          'Laser',          'Cắt laser',                        NULL,   'HOUR', NULL),
  ('URETHANE_PROC',  'Urethane',       'Quy trình Urethane (đúc khuôn)',   NULL,   'HOUR', NULL),
  ('SANDING',        'Sanding',        'Xử lý bề mặt phun bi / cát',       NULL,   'HOUR', NULL),
  ('MEASURE',        'Measure',        'Đo lường / kiểm tra kích thước',   NULL,   'HOUR', NULL),
  ('COATING',        'Coating',        'Phủ bề mặt',                       NULL,   'HOUR', NULL),
  ('MOLD',           'Mold',           'Đúc khuôn',                        NULL,   'HOUR', NULL),
  ('HEATING_SILICON','Heating Silicon','Gia nhiệt Silicon',                NULL,   'HOUR', NULL),
  ('PLATING',        'Plating',        'Mạ điện hoá',                      NULL,   'HOUR', NULL),
  ('HRC',            'HRC',            'Tôi Nhiệt (đo độ cứng HRC)',      NULL,   'HOUR', NULL),
  ('DLC',            'DLC',            'DLC (phủ Diamond-Like Carbon)',    NULL,   'HOUR', NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verify counts
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_mat INT;
  v_proc INT;
BEGIN
  SELECT COUNT(*) INTO v_mat FROM app.material_master;
  SELECT COUNT(*) INTO v_proc FROM app.process_master;
  RAISE NOTICE '[0031] FULL CATALOG: material_master=% rows, process_master=% rows', v_mat, v_proc;
END $$;
