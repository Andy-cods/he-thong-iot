-- ════════════════════════════════════════════════════════════════════
-- 0091_bom_qty_per_set_fix_smoke.sql — SMOKE TEST TAY cho 0091.
-- Dựng dữ liệu giả → chạy ĐÚNG 2 câu UPDATE của 0091 (bản sao trong hàm
-- pg_temp.fix_0091 — GIỮ ĐỒNG BỘ khi sửa 0091) → kiểm → chạy lần 2 (idempotent).
--
-- Kiểm:
--   1. TRIEN_KHAI 4 bộ: dòng coef 6 / qty 24 → 6 (fileQty 24, qtyFix, row_version+1);
--      dòng coef 1 / qty 4 → 1.
--   2. Không đổi: dòng đã sửa tay (coef 2, qty 5), dòng thêm tay (coef NULL),
--      BOM TRIEN_KHAI 1 bộ, BOM mẫu cũ (không có metadata.template) dù coef × target khớp.
--   3. Snapshot: dòng còn trong bom_line + batch → sửa; dòng đã xoá (chỉ còn
--      trong batch preview) → sửa theo Hệ số + Số bộ của batch; dòng lệch → giữ.
--   4. Chạy lần 2 không đổi gì (row_version, snapshot giữ nguyên).
--
-- Chạy được TRƯỚC hoặc SAU khi apply 0091. Tự ROLLBACK, KHÔNG để lại dữ liệu:
--   docker cp packages/db/migrations/0091_bom_qty_per_set_fix_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1 -f /tmp/0091_bom_qty_per_set_fix_smoke.sql
-- Kết quả mong đợi: các NOTICE "OK …", cuối cùng ROLLBACK. 'SMOKE FAIL' = sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

CREATE FUNCTION pg_temp.fix_0091() RETURNS void LANGUAGE sql AS $fn$
  UPDATE app.bom_line l
  SET qty_per_parent = l.coef,
      metadata = COALESCE(l.metadata, '{}'::jsonb)
                 || jsonb_build_object('fileQty', trim_scale(l.qty_per_parent), 'qtyFix', '0091'),
      row_version = l.row_version + 1,
      updated_at = now()
  FROM app.bom_template t
  WHERE t.id = l.template_id
    AND t.metadata ->> 'template' = 'TRIEN_KHAI'
    AND t.target_qty > 1
    AND l.coef > 0
    AND l.qty_per_parent = l.coef * t.target_qty;

  WITH src AS (
    SELECT r.id AS rev_id,
           e.ord,
           e.line,
           COALESCE(fb.coef, bl.coef) AS coef,
           CASE WHEN fb.coef IS NOT NULL THEN fb.sets ELSE t.target_qty END AS sets
    FROM app.bom_revision r
    JOIN app.bom_template t ON t.id = r.template_id
    CROSS JOIN LATERAL jsonb_array_elements(r.frozen_snapshot -> 'lines') WITH ORDINALITY AS e(line, ord)
    LEFT JOIN LATERAL (
      SELECT NULLIF(pr ->> 'coef', '')::numeric AS coef,
             COALESCE(NULLIF(b.preview_json -> 'trienKhai' ->> 'setCount', '')::numeric, 1) AS sets
      FROM app.import_batch b
      CROSS JOIN LATERAL jsonb_array_elements(b.preview_json -> 'trienKhai' -> 'rows') AS pr
      WHERE b.id::text = e.line -> 'metadata' ->> 'importedFromBatch'
        AND pr ->> 'rowNumber' = e.line -> 'metadata' ->> 'importedRow'
      LIMIT 1
    ) fb ON true
    LEFT JOIN app.bom_line bl ON bl.id::text = e.line ->> 'id'
    WHERE t.metadata ->> 'template' = 'TRIEN_KHAI'
      AND jsonb_typeof(r.frozen_snapshot -> 'lines') = 'array'
  ),
  flag AS (
    SELECT src.*,
           (coef > 0 AND sets > 1
            AND (line ->> 'qtyPerParent') ~ '^[0-9]+(\.[0-9]+)?$'
            AND (line ->> 'qtyPerParent')::numeric = coef * sets) AS fix
    FROM src
  ),
  agg AS (
    SELECT rev_id,
           jsonb_agg(
             CASE WHEN fix THEN
               line
               || jsonb_build_object('qtyPerParent', coef::numeric(18, 6)::text)
               || jsonb_build_object('metadata',
                    COALESCE(line -> 'metadata', '{}'::jsonb)
                    || jsonb_build_object('fileQty', trim_scale((line ->> 'qtyPerParent')::numeric),
                                          'qtyFix', '0091'))
             ELSE line END
             ORDER BY ord
           ) AS new_lines,
           count(*) FILTER (WHERE fix) AS n_fix
    FROM flag
    GROUP BY rev_id
  )
  UPDATE app.bom_revision r
  SET frozen_snapshot = jsonb_set(r.frozen_snapshot, '{lines}', agg.new_lines)
  FROM agg
  WHERE agg.rev_id = r.id
    AND agg.n_fix > 0;
$fn$;

DO $$
DECLARE
  v_item uuid; v_ta uuid; v_tb uuid; v_tc uuid; v_sa uuid; v_sb uuid; v_sc uuid; v_batch uuid; v_rev uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid; v_lb uuid; v_lc uuid;
  v_gone uuid := gen_random_uuid();
  r record;
  snap jsonb;
  v_rv0 int;
BEGIN
  INSERT INTO app.item (sku, name, item_type, uom)
  VALUES ('SMOKE-0091-' || substr(md5(random()::text), 1, 8), 'Smoke 0091', 'PURCHASED', 'PCS')
  RETURNING id INTO v_item;

  INSERT INTO app.import_batch (kind, file_hash, file_name, preview_json)
  VALUES ('bom', md5(random()::text), 'smoke-0091.xlsx',
          jsonb_build_object('template', 'TRIEN_KHAI', 'trienKhai', jsonb_build_object(
            'setCount', 4,
            'rows', jsonb_build_array(
              jsonb_build_object('rowNumber', 5, 'coef', 6, 'qty', 24),
              jsonb_build_object('rowNumber', 9, 'coef', 3, 'qty', 12)))))
  RETURNING id INTO v_batch;

  INSERT INTO app.bom_template (code, name, target_qty, metadata)
  VALUES ('SMOKE-0091-A-' || substr(md5(random()::text), 1, 6), 'TK 4 bộ', 4,
          jsonb_build_object('template', 'TRIEN_KHAI', 'importedFromBatch', v_batch))
  RETURNING id INTO v_ta;
  INSERT INTO app.bom_template (code, name, target_qty, metadata)
  VALUES ('SMOKE-0091-B-' || substr(md5(random()::text), 1, 6), 'TK 1 bộ', 1, '{"template":"TRIEN_KHAI"}')
  RETURNING id INTO v_tb;
  INSERT INTO app.bom_template (code, name, target_qty, metadata)
  VALUES ('SMOKE-0091-C-' || substr(md5(random()::text), 1, 6), 'Mẫu cũ 4 bộ', 4, '{}')
  RETURNING id INTO v_tc;

  INSERT INTO app.bom_sheet (template_id, name) VALUES (v_ta, 'BOM') RETURNING id INTO v_sa;
  INSERT INTO app.bom_sheet (template_id, name) VALUES (v_tb, 'BOM') RETURNING id INTO v_sb;
  INSERT INTO app.bom_sheet (template_id, name) VALUES (v_tc, 'BOM') RETURNING id INTO v_sc;

  INSERT INTO app.bom_line (template_id, sheet_id, component_item_id, position, qty_per_parent, coef, metadata)
  VALUES (v_ta, v_sa, v_item, 1, 24, 6,
          jsonb_build_object('seq', 'CP3', 'importedRow', 5, 'importedFromBatch', v_batch, 'importedFromSheet', 'TRIEN_KHAI'))
  RETURNING id INTO v_l1;
  INSERT INTO app.bom_line (template_id, sheet_id, component_item_id, position, qty_per_parent, coef, metadata)
  VALUES (v_ta, v_sa, v_item, 2, 4, 1, '{"seq":"CP1"}') RETURNING id INTO v_l2;
  INSERT INTO app.bom_line (template_id, sheet_id, component_item_id, position, qty_per_parent, coef, metadata)
  VALUES (v_ta, v_sa, v_item, 3, 5, 2, '{"seq":"CP4"}') RETURNING id INTO v_l3;
  INSERT INTO app.bom_line (template_id, sheet_id, component_item_id, position, qty_per_parent, coef, metadata)
  VALUES (v_ta, v_sa, v_item, 4, 3, NULL, '{}') RETURNING id INTO v_l4;
  INSERT INTO app.bom_line (template_id, sheet_id, component_item_id, position, qty_per_parent, coef, metadata)
  VALUES (v_tb, v_sb, v_item, 1, 2, 2, '{}') RETURNING id INTO v_lb;
  INSERT INTO app.bom_line (template_id, sheet_id, component_item_id, position, qty_per_parent, coef, metadata)
  VALUES (v_tc, v_sc, v_item, 1, 24, 6, '{"totalQty":"24"}') RETURNING id INTO v_lc;

  INSERT INTO app.bom_revision (template_id, revision_no, status, frozen_snapshot)
  VALUES (v_ta, 'R01', 'RELEASED', jsonb_build_object('templateId', v_ta, 'lines', jsonb_build_array(
    jsonb_build_object('id', v_l1, 'qtyPerParent', '24.000000', 'scrapPercent', '0',
                       'metadata', jsonb_build_object('importedRow', 5, 'importedFromBatch', v_batch)),
    jsonb_build_object('id', v_l3, 'qtyPerParent', '5.000000', 'scrapPercent', '0', 'metadata', '{}'::jsonb),
    jsonb_build_object('id', v_gone, 'qtyPerParent', '12.000000', 'scrapPercent', '0',
                       'metadata', jsonb_build_object('importedRow', 9, 'importedFromBatch', v_batch)),
    jsonb_build_object('id', v_l2, 'qtyPerParent', '4.000000', 'scrapPercent', '0', 'metadata', '{}'::jsonb))))
  RETURNING id INTO v_rev;

  SELECT row_version INTO v_rv0 FROM app.bom_line WHERE id = v_l1;

  -- ── Lần 1 ──
  PERFORM pg_temp.fix_0091();

  SELECT qty_per_parent, metadata, row_version INTO r FROM app.bom_line WHERE id = v_l1;
  IF r.qty_per_parent <> 6 OR (r.metadata ->> 'fileQty')::numeric <> 24 OR r.metadata ->> 'qtyFix' <> '0091'
     OR r.metadata ->> 'seq' <> 'CP3' OR r.row_version <> v_rv0 + 1 THEN
    RAISE EXCEPTION 'SMOKE FAIL 1a: L1 = % / % / v%', r.qty_per_parent, r.metadata, r.row_version;
  END IF;
  IF (SELECT qty_per_parent FROM app.bom_line WHERE id = v_l2) <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 1b: L2'; END IF;
  RAISE NOTICE 'OK 1: dòng lỗi → Hệ số, giữ fileQty + metadata cũ, row_version +1';

  IF (SELECT qty_per_parent FROM app.bom_line WHERE id = v_l3) <> 5
     OR (SELECT qty_per_parent FROM app.bom_line WHERE id = v_l4) <> 3
     OR (SELECT qty_per_parent FROM app.bom_line WHERE id = v_lb) <> 2
     OR (SELECT qty_per_parent FROM app.bom_line WHERE id = v_lc) <> 24
     OR EXISTS (SELECT 1 FROM app.bom_line WHERE id IN (v_l3, v_l4, v_lb, v_lc) AND metadata ? 'qtyFix') THEN
    RAISE EXCEPTION 'SMOKE FAIL 2: dòng ngoài predicate bị đổi';
  END IF;
  RAISE NOTICE 'OK 2: dòng sửa tay / thêm tay / BOM 1 bộ / mẫu cũ giữ nguyên';

  SELECT frozen_snapshot -> 'lines' INTO snap FROM app.bom_revision WHERE id = v_rev;
  IF snap -> 0 ->> 'qtyPerParent' <> '6.000000' OR (snap -> 0 -> 'metadata' ->> 'fileQty')::numeric <> 24
     OR snap -> 0 -> 'metadata' ->> 'importedFromBatch' <> v_batch::text THEN
    RAISE EXCEPTION 'SMOKE FAIL 3a: snapshot L1 = %', snap -> 0;
  END IF;
  IF snap -> 1 ->> 'qtyPerParent' <> '5.000000' OR snap -> 1 -> 'metadata' ? 'qtyFix' THEN
    RAISE EXCEPTION 'SMOKE FAIL 3b: snapshot L3 bị đổi = %', snap -> 1;
  END IF;
  IF snap -> 2 ->> 'qtyPerParent' <> '3.000000' THEN
    RAISE EXCEPTION 'SMOKE FAIL 3c: snapshot dòng đã xoá (theo batch) = %', snap -> 2;
  END IF;
  IF snap -> 3 ->> 'qtyPerParent' <> '1.000000' THEN
    RAISE EXCEPTION 'SMOKE FAIL 3d: snapshot L2 (fallback bom_line) = %', snap -> 3;
  END IF;
  IF jsonb_array_length(snap) <> 4 OR snap -> 2 ->> 'id' <> v_gone::text THEN
    RAISE EXCEPTION 'SMOKE FAIL 3e: thứ tự/số dòng snapshot đổi';
  END IF;
  RAISE NOTICE 'OK 3: snapshot sửa theo batch / bom_line, giữ thứ tự, dòng lệch giữ nguyên';

  -- ── Lần 2: idempotent ──
  PERFORM pg_temp.fix_0091();
  IF (SELECT row_version FROM app.bom_line WHERE id = v_l1) <> v_rv0 + 1
     OR (SELECT qty_per_parent FROM app.bom_line WHERE id = v_l1) <> 6
     OR (SELECT frozen_snapshot -> 'lines' FROM app.bom_revision WHERE id = v_rev) <> snap THEN
    RAISE EXCEPTION 'SMOKE FAIL 4: chạy lần 2 vẫn đổi dữ liệu';
  END IF;
  RAISE NOTICE 'OK 4: chạy lại không đổi gì';
END $$;

ROLLBACK;
