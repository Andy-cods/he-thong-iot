-- ════════════════════════════════════════════════════════════════════
-- 0089_shift_output_p2_smoke.sql — SMOKE TEST TAY cho 0089 (Sản lượng ca P2).
-- Kiểm: cột work_start/work_end + image_asset_id tồn tại; CHECK cửa sổ giờ
-- (1 cột NULL → lỗi, bằng nhau → lỗi, qua nửa đêm OK); dừng ≤ shift_minutes
-- (phút thực tế) vẫn chặn; ca qua nửa đêm 19:00–07:00; FK ảnh → bom_asset với
-- ON DELETE SET NULL; dòng cũ (work_start NULL) không bị đổi.
--
-- Chạy SAU khi apply 0089. Tự ROLLBACK, KHÔNG để lại dữ liệu:
--   docker cp packages/db/migrations/0089_shift_output_p2_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1 -f /tmp/0089_shift_output_p2_smoke.sql
-- Kết quả mong đợi: các NOTICE "OK …", cuối cùng ROLLBACK. 'SMOKE FAIL' = sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

DO $$
DECLARE
  n int;
  v_site uuid; v_m1 uuid; v_ca uuid; v_night uuid; v_part uuid; v_asset uuid; v_e uuid;
  v_legacy_before bigint; v_legacy_after bigint;
BEGIN
  -- 0. Cột + ràng buộc tồn tại.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'app' AND table_name = 'shift_output_entry' AND column_name IN ('work_start','work_end');
  IF n <> 2 THEN RAISE EXCEPTION 'SMOKE FAIL 0a: thiếu cột work_start/work_end (%)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'app' AND table_name = 'site_part' AND column_name = 'image_asset_id') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0b: thiếu site_part.image_asset_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_work_window_chk') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0c: thiếu CHECK shift_output_entry_work_window_chk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_part_image_asset_fk') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0d: thiếu FK site_part_image_asset_fk';
  END IF;
  RAISE NOTICE 'OK 0: cột + CHECK + FK đủ';

  SELECT count(*) INTO v_legacy_before FROM app.shift_output_entry WHERE work_start IS NULL;

  SELECT id INTO v_site FROM app.site WHERE code = 'DONGAN';
  IF v_site IS NULL THEN RAISE EXCEPTION 'SMOKE FAIL: không có site DONGAN'; END IF;
  SELECT id INTO v_m1 FROM app.site_machine WHERE site_id = v_site ORDER BY sort_order, code LIMIT 1;

  INSERT INTO app.site_shift (site_id, code, name, start_time, end_time, crosses_midnight, sort_order)
  VALUES (v_site, 'SMK-NGAY', 'Ca ngày smoke', '07:00', '19:00', false, 91) RETURNING id INTO v_ca;
  INSERT INTO app.site_shift (site_id, code, name, start_time, end_time, crosses_midnight, sort_order)
  VALUES (v_site, 'SMK-DEM', 'Ca đêm smoke', '19:00', '07:00', true, 92) RETURNING id INTO v_night;
  RAISE NOTICE 'OK 1: tạo 2 ca 12 giờ (07–19, 19–07 qua nửa đêm)';

  INSERT INTO app.site_part (site_id, code, name) VALUES (v_site, 'SMK-P2-PART', 'Mã smoke P2') RETURNING id INTO v_part;

  -- 2. Dòng có giờ thực tế 07:00–19:00 = 720'.
  INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id,
                                      qty_ok, qty_ng, downtime_min, shift_minutes, work_start, work_end)
  VALUES (v_site, gen_random_uuid(), DATE '2026-11-20', v_ca, v_m1, v_part, 500, 3, 60, 720, '07:00', '19:00')
  RETURNING id INTO v_e;
  RAISE NOTICE 'OK 2: dòng giờ thực tế 07:00–19:00, shift_minutes 720';

  -- 3. Qua nửa đêm: 19:30–06:30 (work_end < work_start) hợp lệ.
  INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id,
                                      qty_ok, qty_ng, shift_minutes, work_start, work_end)
  VALUES (v_site, gen_random_uuid(), DATE '2026-11-20', v_night, v_m1, v_part, 400, 0, 660, '19:30', '06:30');
  RAISE NOTICE 'OK 3: giờ thực tế qua nửa đêm 19:30–06:30 hợp lệ';

  -- 4. CHECK cửa sổ giờ.
  BEGIN
    UPDATE app.shift_output_entry SET work_end = NULL WHERE id = v_e;
    RAISE EXCEPTION 'SMOKE FAIL 4a: chỉ 1 trong 2 giờ vẫn lưu được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 4a: phải có cả giờ bắt đầu lẫn kết thúc';
  END;
  BEGIN
    UPDATE app.shift_output_entry SET work_end = '07:00' WHERE id = v_e;
    RAISE EXCEPTION 'SMOKE FAIL 4b: giờ bắt đầu = kết thúc vẫn lưu được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 4b: chặn giờ bắt đầu = kết thúc';
  END;

  -- 5. Dừng ≤ shift_minutes (phút thực tế) vẫn chặn khi rút ngắn giờ chạy.
  BEGIN
    UPDATE app.shift_output_entry SET work_start = '07:00', work_end = '07:30', shift_minutes = 30 WHERE id = v_e;
    RAISE EXCEPTION 'SMOKE FAIL 5: dừng 60'' > 30'' chạy vẫn lưu được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5: dừng ≤ phút chạy thực tế';
  END;

  -- 6. Ảnh mã hàng: FK bom_asset, xoá asset → NULL.
  INSERT INTO app.bom_asset (sha256, mime, path_full, path_thumb)
  VALUES (repeat('a', 64), 'image/png', 'bom/full/smoke.png', 'bom/thumb/smoke.webp')
  ON CONFLICT (sha256) DO UPDATE SET mime = EXCLUDED.mime
  RETURNING id INTO v_asset;
  UPDATE app.site_part SET image_asset_id = v_asset WHERE id = v_part;
  BEGIN
    UPDATE app.site_part SET image_asset_id = gen_random_uuid() WHERE id = v_part;
    RAISE EXCEPTION 'SMOKE FAIL 6a: image_asset_id không tồn tại vẫn lưu được';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK 6a: FK ảnh → bom_asset';
  END;
  DELETE FROM app.bom_asset WHERE id = v_asset;
  IF (SELECT image_asset_id FROM app.site_part WHERE id = v_part) IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 6b: xoá asset không SET NULL';
  END IF;
  RAISE NOTICE 'OK 6b: xoá asset → site_part.image_asset_id NULL';

  -- 7. Dòng cũ không bị đụng.
  SELECT count(*) INTO v_legacy_after FROM app.shift_output_entry WHERE work_start IS NULL;
  IF v_legacy_after <> v_legacy_before THEN
    RAISE EXCEPTION 'SMOKE FAIL 7: số dòng cũ (work_start NULL) đổi % → %', v_legacy_before, v_legacy_after;
  END IF;
  RAISE NOTICE 'OK 7: % dòng cũ / demo giữ nguyên (work_start NULL, shift_minutes cũ)', v_legacy_after;
END $$;

ROLLBACK;
