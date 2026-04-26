-- ============================================================================
-- V2.0 Phase 2 Sprint 6 — Migration 0032
--   Backfill FULL catalog (63 mat + 19 proc) vào MỌI MATERIAL sheet
-- ----------------------------------------------------------------------------
-- User feedback (2026-04-27): "tôi muốn nó có đầy đủ sẵn luôn ở tất cả bom
-- list hiện tại chứ không phải giờ mới thêm mới vào từng vật liệu 1"
--
-- Loop qua mỗi bom_sheet kind=MATERIAL → INSERT all material_master active
-- (63 rows) + all process_master active (19 rows) làm rows. Idempotent qua
-- WHERE NOT EXISTS check theo (sheet_id, code).
--
-- Sau migration, mọi BOM cũ tab Material&Process có sẵn 82 rows
-- (63 mat + 19 proc), user chỉ cần fill price/qty/status thay vì click
-- + Thêm từng vật liệu một.
--
-- Refs: user feedback 2026-04-27 + codexdo.md TASK-20260427-006
-- ============================================================================

SET search_path TO app, public;

-- ---------------------------------------------------------------------------
-- Phase 1: Tạo sheet "Material & Process" cho mỗi BOM template chưa có
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_template_id UUID;
  v_max_pos INT;
  v_created INT := 0;
BEGIN
  FOR v_template_id IN
    SELECT t.id FROM app.bom_template t
    WHERE NOT EXISTS (
      SELECT 1 FROM app.bom_sheet s
      WHERE s.template_id = t.id AND s.kind = 'MATERIAL'
    )
  LOOP
    SELECT COALESCE(MAX(position), 0) INTO v_max_pos
    FROM app.bom_sheet WHERE template_id = v_template_id;

    INSERT INTO app.bom_sheet (template_id, name, kind, position, metadata)
    VALUES (
      v_template_id,
      'Material & Process',
      'MATERIAL',
      v_max_pos + 1,
      jsonb_build_object('autoCreated', true, 'reason', 'backfill 0032')
    )
    ON CONFLICT (template_id, name) DO NOTHING;
    v_created := v_created + 1;
  END LOOP;
  RAISE NOTICE '[0032 phase 1] Created % new MATERIAL sheets for templates that lacked one', v_created;
END $$;

-- ---------------------------------------------------------------------------
-- Phase 2: Loop qua mỗi MATERIAL sheet → populate full catalog
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  s RECORD;
  m RECORD;
  p RECORD;
  v_pos INT;
  v_sheets_processed INT := 0;
  v_mat_inserted INT := 0;
  v_proc_inserted INT := 0;
BEGIN
  -- Loop qua mỗi MATERIAL sheet
  FOR s IN
    SELECT id, template_id FROM app.bom_sheet WHERE kind = 'MATERIAL'
  LOOP
    v_sheets_processed := v_sheets_processed + 1;

    -- ----- Materials -----
    SELECT COALESCE(MAX(position), 0) INTO v_pos
    FROM app.bom_sheet_material_row WHERE sheet_id = s.id;

    FOR m IN
      SELECT code, name_vn, price_per_kg
      FROM app.material_master
      WHERE is_active = TRUE
      ORDER BY category NULLS LAST, code
    LOOP
      v_pos := v_pos + 1;
      INSERT INTO app.bom_sheet_material_row
        (sheet_id, material_code, name_override, price_per_kg, status, position)
      SELECT s.id, m.code, m.name_vn, m.price_per_kg, 'PLANNED', v_pos
      WHERE NOT EXISTS (
        SELECT 1 FROM app.bom_sheet_material_row
        WHERE sheet_id = s.id AND material_code = m.code
      );
      IF FOUND THEN
        v_mat_inserted := v_mat_inserted + 1;
      END IF;
    END LOOP;

    -- ----- Processes -----
    SELECT COALESCE(MAX(position), 0) INTO v_pos
    FROM app.bom_sheet_process_row WHERE sheet_id = s.id;

    FOR p IN
      SELECT code, name_vn, price_per_unit, pricing_unit
      FROM app.process_master
      WHERE is_active = TRUE
      ORDER BY code
    LOOP
      v_pos := v_pos + 1;
      INSERT INTO app.bom_sheet_process_row
        (sheet_id, process_code, name_override, price_per_unit, pricing_unit, position)
      SELECT s.id, p.code, p.name_vn, p.price_per_unit, p.pricing_unit::text, v_pos
      WHERE NOT EXISTS (
        SELECT 1 FROM app.bom_sheet_process_row
        WHERE sheet_id = s.id AND process_code = p.code
      );
      IF FOUND THEN
        v_proc_inserted := v_proc_inserted + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[0032] Sheets processed=% | material_rows inserted=% | process_rows inserted=%',
    v_sheets_processed, v_mat_inserted, v_proc_inserted;
END $$;

-- ---------------------------------------------------------------------------
-- Verify counts
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total_sheets INT;
  v_total_mat_rows INT;
  v_total_proc_rows INT;
  v_min_per_sheet_mat INT;
  v_min_per_sheet_proc INT;
BEGIN
  SELECT COUNT(*) INTO v_total_sheets FROM app.bom_sheet WHERE kind = 'MATERIAL';
  SELECT COUNT(*) INTO v_total_mat_rows FROM app.bom_sheet_material_row;
  SELECT COUNT(*) INTO v_total_proc_rows FROM app.bom_sheet_process_row;

  SELECT MIN(c) INTO v_min_per_sheet_mat FROM (
    SELECT COUNT(*)::int AS c
    FROM app.bom_sheet_material_row r
    JOIN app.bom_sheet s ON s.id = r.sheet_id
    WHERE s.kind = 'MATERIAL'
    GROUP BY r.sheet_id
  ) t;

  SELECT MIN(c) INTO v_min_per_sheet_proc FROM (
    SELECT COUNT(*)::int AS c
    FROM app.bom_sheet_process_row r
    JOIN app.bom_sheet s ON s.id = r.sheet_id
    WHERE s.kind = 'MATERIAL'
    GROUP BY r.sheet_id
  ) t;

  RAISE NOTICE '[0032] MATERIAL sheets=%, mat_rows total=%, proc_rows total=%, min mat per sheet=%, min proc per sheet=%',
    v_total_sheets, v_total_mat_rows, v_total_proc_rows,
    COALESCE(v_min_per_sheet_mat, 0), COALESCE(v_min_per_sheet_proc, 0);
END $$;
