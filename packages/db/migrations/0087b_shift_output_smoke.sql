-- ════════════════════════════════════════════════════════════════════
-- 0087b_shift_output_smoke.sql — SMOKE TEST TAY cho 0087a + 0087b (Sản lượng ca).
-- Thử RÀNG BUỘC THẬT (unique client_uuid, unique slot có xoá mềm, FK ghép theo
-- site, CHECK số lượng / rework ≤ NG / dừng ≤ phút ca / dòng rỗng, CHECK giờ ca,
-- CHECK thiết lập xưởng, unique tên người theo lower()) + câu ghi có version
-- giống repo (UPDATE … WHERE version = $v) + CASCADE chi tiết lỗi.
--
-- Chạy SAU khi apply 0087a + 0087b. Tự ROLLBACK, KHÔNG để lại dữ liệu:
--   docker cp packages/db/migrations/0087b_shift_output_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1 -f /tmp/0087b_shift_output_smoke.sql
-- Kết quả mong đợi: các NOTICE "OK …", cuối cùng ROLLBACK. 'SMOKE FAIL' = sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

-- ── 0. Đối tượng + seed tồn tại ─────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'app' AND table_name IN (
     'site','user_site','site_machine','site_shift','site_part','site_operator',
     'site_defect_reason','site_downtime_reason','shift_output_entry',
     'shift_output_defect','shift_output_downtime');
  IF n <> 11 THEN RAISE EXCEPTION 'SMOKE FAIL 0: chỉ có % / 11 bảng', n; END IF;

  IF EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = 'role_code' AND t.typtype = 'e'
             AND NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = t.oid AND e.enumlabel = 'workshop')) THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: có enum role_code thiếu workshop (0087a chưa chạy?)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.role WHERE code = 'workshop') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu app.role workshop';
  END IF;

  SELECT count(*) INTO n FROM app.site_machine m JOIN app.site s ON s.id = m.site_id WHERE s.code = 'DONGAN';
  IF n < 2 THEN RAISE EXCEPTION 'SMOKE FAIL 0: DONGAN thiếu máy (%)', n; END IF;
  SELECT count(*) INTO n FROM app.site_shift sh JOIN app.site s ON s.id = sh.site_id
   WHERE s.code = 'DONGAN' AND ((sh.code='CA1' AND sh.start_time='08:00' AND sh.end_time='12:00')
                             OR (sh.code='CA2' AND sh.start_time='13:00' AND sh.end_time='17:00')
                             OR (sh.code='CA3' AND sh.start_time='18:00' AND sh.end_time='22:00'));
  IF n <> 3 THEN RAISE EXCEPTION 'SMOKE FAIL 0: ca DONGAN sai (% / 3)', n; END IF;
  SELECT count(*) INTO n FROM app.site_defect_reason d JOIN app.site s ON s.id = d.site_id WHERE s.code = 'DONGAN';
  IF n < 10 THEN RAISE EXCEPTION 'SMOKE FAIL 0: thiếu lý do lỗi (%)', n; END IF;
  SELECT count(*) INTO n FROM app.site_downtime_reason d JOIN app.site s ON s.id = d.site_id
   WHERE s.code = 'DONGAN' AND d.is_planned;
  IF n <> 3 THEN RAISE EXCEPTION 'SMOKE FAIL 0: lý do dừng kế hoạch phải = 3 (SETUP/BAO_DUONG/KHONG_KH), có %', n; END IF;
  IF EXISTS (SELECT 1 FROM app.site_part p JOIN app.site s ON s.id = p.site_id WHERE s.code = 'DONGAN') THEN
    RAISE NOTICE 'Lưu ý: DONGAN đã có mã hàng (không seed — có thể do người dùng tạo)';
  END IF;
  RAISE NOTICE 'OK 0: 11 bảng, enum workshop, role, seed DONGAN (2 máy, 3 ca 08-12/13-17/18-22, 10 lỗi, 10 dừng)';
END $$;

-- ── 1..n. Dữ liệu test + từng luật ──────────────────────────────────
DO $$
DECLARE
  v_site uuid; v_site2 uuid;
  v_m1 uuid; v_m2 uuid; v_m_other uuid;
  v_ca1 uuid; v_part uuid; v_part2 uuid; v_op uuid;
  v_def uuid; v_dt uuid;
  v_e1 uuid; v_e2 uuid;
  v_cu uuid := gen_random_uuid();
  v_rows int;
  v_user uuid;
BEGIN
  SELECT id INTO v_site FROM app.site WHERE code = 'DONGAN';
  SELECT id INTO v_m1 FROM app.site_machine WHERE site_id = v_site AND code = 'CNC-01';
  SELECT id INTO v_m2 FROM app.site_machine WHERE site_id = v_site AND code = 'CNC-02';
  SELECT id INTO v_ca1 FROM app.site_shift WHERE site_id = v_site AND code = 'CA1';
  SELECT id INTO v_def FROM app.site_defect_reason WHERE site_id = v_site AND code = 'KT_SAI';
  SELECT id INTO v_dt FROM app.site_downtime_reason WHERE site_id = v_site AND code = 'THAY_DAO';

  INSERT INTO app.site_part (site_id, code, name) VALUES (v_site, 'SMOKE-TRUC-D20', 'Trục D20 smoke') RETURNING id INTO v_part;
  INSERT INTO app.site_part (site_id, code, name) VALUES (v_site, 'SMOKE-BAC-12', 'Bạc 12 smoke') RETURNING id INTO v_part2;
  INSERT INTO app.site_operator (site_id, full_name) VALUES (v_site, 'Nguyễn Văn Smoke') RETURNING id INTO v_op;

  -- Site thứ 2 để thử FK ghép.
  INSERT INTO app.site (code, name) VALUES ('SMOKE2', 'Site smoke 2') RETURNING id INTO v_site2;
  INSERT INTO app.site_machine (site_id, code, name) VALUES (v_site2, 'X-01', 'Máy site khác') RETURNING id INTO v_m_other;

  -- 1. Dòng hợp lệ (2 mã cùng máy-ca) + chi tiết lỗi/dừng.
  INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, operator_id,
                                      qty_ok, qty_ng, qty_rework, downtime_min, shift_minutes)
  VALUES (v_site, v_cu, DATE '2026-11-18', v_ca1, v_m1, v_part, v_op, 480, 12, 2, 30, 240) RETURNING id INTO v_e1;
  INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
  VALUES (v_site, gen_random_uuid(), DATE '2026-11-18', v_ca1, v_m1, v_part2, 100, 0, 240) RETURNING id INTO v_e2;
  INSERT INTO app.shift_output_defect (entry_id, reason_id, qty) VALUES (v_e1, v_def, 7);
  INSERT INTO app.shift_output_downtime (entry_id, reason_id, minutes) VALUES (v_e1, v_dt, 30);
  RAISE NOTICE 'OK 1: tạo 2 dòng cùng máy-ca khác mã + chi tiết lỗi/dừng';

  -- 2. client_uuid trùng → unique_violation (idempotent ở app trả replayed).
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
    VALUES (v_site, v_cu, DATE '2026-11-19', v_ca1, v_m2, v_part, 1, 0, 240);
    RAISE EXCEPTION 'SMOKE FAIL 2: trùng client_uuid vẫn insert được';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 2: chặn trùng client_uuid';
  END;

  -- 3. Trùng slot (site, ngày, ca, máy, mã) → unique_violation; xoá mềm rồi nhập lại được.
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-18', v_ca1, v_m1, v_part, 5, 0, 240);
    RAISE EXCEPTION 'SMOKE FAIL 3: trùng slot vẫn insert được';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 3a: chặn trùng slot';
  END;
  UPDATE app.shift_output_entry SET deleted_at = now(), delete_reason = 'smoke xoá mềm' WHERE id = v_e2;
  INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
  VALUES (v_site, gen_random_uuid(), DATE '2026-11-18', v_ca1, v_m1, v_part2, 90, 0, 240);
  RAISE NOTICE 'OK 3b: slot đã xoá mềm nhập lại được (unique partial WHERE deleted_at IS NULL)';

  -- 4. FK ghép: máy của site khác → foreign_key_violation.
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-18', v_ca1, v_m_other, v_part, 5, 0, 240);
    RAISE EXCEPTION 'SMOKE FAIL 4: máy site khác vẫn insert được';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK 4: FK ghép chặn máy của site khác';
  END;

  -- 5. CHECK: rework > NG, dừng > phút ca, dòng rỗng, số âm, vượt 100.000.
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, qty_rework, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-17', v_ca1, v_m2, v_part, 10, 2, 3, 240);
    RAISE EXCEPTION 'SMOKE FAIL 5a: rework > NG vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5a: rework ≤ NG';
  END;
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, downtime_min, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-17', v_ca1, v_m2, v_part, 10, 0, 241, 240);
    RAISE EXCEPTION 'SMOKE FAIL 5b: dừng > phút ca vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5b: dừng ≤ phút ca';
  END;
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-17', v_ca1, v_m2, v_part, 0, 0, 240);
    RAISE EXCEPTION 'SMOKE FAIL 5c: dòng OK=NG=0 không dừng vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5c: chặn dòng rỗng';
  END;
  INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, downtime_min, shift_minutes)
  VALUES (v_site, gen_random_uuid(), DATE '2026-11-17', v_ca1, v_m2, v_part, 0, 0, 240, 240);
  RAISE NOTICE 'OK 5d: dòng chỉ có dừng máy (OK=NG=0, dừng 240) hợp lệ';
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-16', v_ca1, v_m2, v_part, -1, 5, 240);
    RAISE EXCEPTION 'SMOKE FAIL 5e: số âm vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5e: chặn số âm';
  END;
  BEGIN
    INSERT INTO app.shift_output_entry (site_id, client_uuid, prod_date, shift_id, machine_id, part_id, qty_ok, qty_ng, shift_minutes)
    VALUES (v_site, gen_random_uuid(), DATE '2026-11-16', v_ca1, v_m2, v_part, 100001, 0, 240);
    RAISE EXCEPTION 'SMOKE FAIL 5f: > 100.000 vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5f: chặn > 100.000';
  END;

  -- 6. Chi tiết lỗi: qty 0 bị chặn, lý do lặp bị chặn.
  BEGIN
    INSERT INTO app.shift_output_defect (entry_id, reason_id, qty) VALUES (v_e1, (SELECT id FROM app.site_defect_reason WHERE site_id = v_site AND code = 'BAVIA'), 0);
    RAISE EXCEPTION 'SMOKE FAIL 6a: lỗi qty 0 vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 6a: chi tiết lỗi qty > 0';
  END;
  BEGIN
    INSERT INTO app.shift_output_defect (entry_id, reason_id, qty) VALUES (v_e1, v_def, 1);
    RAISE EXCEPTION 'SMOKE FAIL 6b: lý do lỗi lặp vẫn insert được';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 6b: 1 lý do / dòng';
  END;

  -- 7. Ghi có version (khớp repo: UPDATE … WHERE id AND version = $v RETURNING).
  SELECT id INTO v_e1 FROM app.shift_output_entry WHERE id = v_e1 FOR UPDATE;
  UPDATE app.shift_output_entry SET qty_ok = 470, version = version + 1, updated_at = now()
   WHERE id = v_e1 AND version = 1 AND deleted_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 7a: update version 1 phải đổi 1 dòng'; END IF;
  UPDATE app.shift_output_entry SET qty_ok = 1, version = version + 1 WHERE id = v_e1 AND version = 1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'SMOKE FAIL 7b: version cũ vẫn ghi đè được'; END IF;
  RAISE NOTICE 'OK 7: optimistic lock theo version (cũ → 0 dòng → app trả 409 STALE)';

  -- 8. Xoá cứng dòng → CASCADE chi tiết (xoá mềm là đường chính; đây kiểm FK).
  DELETE FROM app.shift_output_entry WHERE id = v_e1;
  IF EXISTS (SELECT 1 FROM app.shift_output_defect WHERE entry_id = v_e1)
     OR EXISTS (SELECT 1 FROM app.shift_output_downtime WHERE entry_id = v_e1) THEN
    RAISE EXCEPTION 'SMOKE FAIL 8: chi tiết không CASCADE';
  END IF;
  RAISE NOTICE 'OK 8: CASCADE chi tiết lỗi/dừng';

  -- 9. Danh mục: tên người trùng (không phân biệt hoa thường), giờ ca sai, thiết lập xưởng sai.
  BEGIN
    INSERT INTO app.site_operator (site_id, full_name) VALUES (v_site, 'NGUYỄN VĂN SMOKE');
    RAISE NOTICE 'Lưu ý 9a: lower() không gập chữ hoa có dấu theo collation — kiểm lại với tên không dấu';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 9a: trùng tên người (lower) bị chặn';
  END;
  BEGIN
    INSERT INTO app.site_operator (site_id, full_name) VALUES (v_site, 'nguyễn văn smoke');
    RAISE EXCEPTION 'SMOKE FAIL 9b: trùng tên người (lower) vẫn insert được';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 9b: trùng tên người chữ thường bị chặn';
  END;
  BEGIN
    INSERT INTO app.site_shift (site_id, code, name, start_time, end_time) VALUES (v_site, 'SMK', 'Ca sai', '12:00', '08:00');
    RAISE EXCEPTION 'SMOKE FAIL 9c: ca kết thúc trước bắt đầu (không qua đêm) vẫn insert được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 9c: CHECK cửa sổ ca';
  END;
  INSERT INTO app.site_shift (site_id, code, name, start_time, end_time, crosses_midnight)
  VALUES (v_site, 'SMKN', 'Ca đêm smoke', '22:00', '06:00', true);
  RAISE NOTICE 'OK 9d: ca qua nửa đêm hợp lệ';
  BEGIN
    UPDATE app.site SET lock_after_hours = 721 WHERE id = v_site;
    RAISE EXCEPTION 'SMOKE FAIL 9e: lock_after_hours 721 vẫn lưu được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 9e: CHECK thiết lập xưởng (0–720 giờ)';
  END;
  BEGIN
    UPDATE app.site SET backdate_days = 32 WHERE id = v_site;
    RAISE EXCEPTION 'SMOKE FAIL 9f: backdate_days 32 vẫn lưu được';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 9f: CHECK lùi ngày (0–31)';
  END;

  -- 10. user_site: 1 user ≤ 1 site (PK), xoá user → CASCADE.
  SELECT id INTO v_user FROM app.user_account ORDER BY created_at LIMIT 1;
  IF v_user IS NOT NULL THEN
    DELETE FROM app.user_site WHERE user_id = v_user;
    INSERT INTO app.user_site (user_id, site_id) VALUES (v_user, v_site);
    BEGIN
      INSERT INTO app.user_site (user_id, site_id) VALUES (v_user, v_site2);
      RAISE EXCEPTION 'SMOKE FAIL 10: 1 user gán được 2 site';
    EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 10: 1 user ≤ 1 site';
    END;
  ELSE
    RAISE NOTICE 'Bỏ qua 10: chưa có user_account';
  END IF;

  -- 11. Câu khoá tính tại chỗ (giống repo): LOCKED hoặc quá kết thúc ca + lock_after_hours.
  SELECT count(*) INTO v_rows
  FROM app.shift_output_entry e
  JOIN app.site s ON s.id = e.site_id
  JOIN app.site_shift sh ON sh.id = e.shift_id
  WHERE e.site_id = v_site AND e.deleted_at IS NULL
    AND (e.status = 'LOCKED'
         OR now() > ((e.prod_date + sh.end_time + CASE WHEN sh.crosses_midnight THEN interval '1 day' ELSE interval '0' END)
                     AT TIME ZONE s.timezone) + make_interval(hours => s.lock_after_hours));
  RAISE NOTICE 'OK 11: câu tính khoá chạy được (% dòng test đã quá hạn khoá)', v_rows;
END $$;

ROLLBACK;
