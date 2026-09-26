-- ════════════════════════════════════════════════════════════════════
-- V4.1 Đợt 4 — SMOKE TEST TAY cho 0066_dot4_wo_bom_link.sql (link Lệnh SX ↔
--   BOM: SX-16/17/18) + các câu SQL mà code Đợt 4 chạy thật: lọc WO theo BOM
--   (list/summary/production-summary), FK ON DELETE SET NULL, advisory lock
--   chống 2 YCSX cùng dòng BOM, số WO theo giờ VN, supersede revision, backfill.
--
-- Chạy SAU khi apply 0066. Script tự ROLLBACK, KHÔNG để lại dữ liệu:
--
--   docker cp plans/v4.1-audit-hoan-thien/sql/dot4_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/dot4_smoke.sql
--
-- Kết quả mong đợi: các NOTICE "OK …", cuối cùng ROLLBACK.
-- Bất kỳ 'SMOKE FAIL …' nào = migration/logic sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;

-- ── 0. Đối tượng tồn tại ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='work_order' AND column_name='bom_template_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='app' AND table_name='work_order' AND column_name='bom_line_id') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu work_order.bom_template_id / bom_line_id (0066 chưa chạy)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='work_order_bom_template_fk' AND confdeltype='n')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='work_order_bom_line_fk' AND confdeltype='n') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu FK work_order_bom_*_fk ON DELETE SET NULL';
  END IF;
  IF to_regclass('app.work_order_bom_template_idx') IS NULL
     OR to_regclass('app.work_order_bom_line_idx') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu index work_order_bom_*_idx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname='bom_revision_status' AND e.enumlabel='SUPERSEDED') THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: enum bom_revision_status thiếu SUPERSEDED (SX-32 cần)';
  END IF;
  IF to_regprocedure('app.reservation_lock(uuid)') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu app.reservation_lock (nhả giữ chỗ khi huỷ WO — SX-08)';
  END IF;
  RAISE NOTICE 'OK 0: cột / FK SET NULL / index / enum SUPERSEDED / reservation_lock tồn tại';
END $$;

-- ── 1..6. Dữ liệu test + kiểm từng luật ─────────────────────────────
DO $$
DECLARE
  v_user  UUID;
  v_item  UUID;
  v_tpl   UUID;
  v_sheet UUID;
  v_line  UUID;
  v_line2 UUID;
  v_wo_bom   UUID;  -- WO tạo từ dòng BOM (link trực tiếp)
  v_wo_meta  UUID;  -- WO cũ link qua metadata.routing.linkedWorkOrderId
  v_wo_audit UUID;  -- WO cũ chỉ có audit CREATE.after_json.bomLineId
  v_wo_free  UUID;  -- WO độc lập (không BOM)
  v_yymm TEXT := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM');
  v_next INT;
  v_cnt  INT;
  v_tid  UUID;
  v_lid  UUID;
  v_rev1 UUID;
  v_rev2 UUID;
BEGIN
  SELECT id INTO v_user FROM app.user_account ORDER BY created_at LIMIT 1;
  SELECT id INTO v_item FROM app.item ORDER BY created_at LIMIT 1;
  IF v_user IS NULL OR v_item IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: DB không có user / item để test';
  END IF;

  INSERT INTO app.bom_template (code, name) VALUES ('SMOKE-DOT4', 'BOM smoke Đợt 4')
  RETURNING id INTO v_tpl;
  INSERT INTO app.bom_sheet (template_id, name) VALUES (v_tpl, 'SMOKE sheet')
  RETURNING id INTO v_sheet;
  INSERT INTO app.bom_line (template_id, component_item_id, sheet_id, position, metadata)
  VALUES (v_tpl, v_item, v_sheet, 1, '{"kind":"fab"}') RETURNING id INTO v_line;
  INSERT INTO app.bom_line (template_id, component_item_id, sheet_id, position, metadata)
  VALUES (v_tpl, v_item, v_sheet, 2, '{"kind":"fab"}') RETURNING id INTO v_line2;

  -- ── 1. Số WO an toàn (genDocNo): khoá advisory theo prefix + MAX+1, giờ VN ──
  PERFORM pg_advisory_xact_lock(hashtext('docno:WO-' || v_yymm));
  SELECT COALESCE(MAX(CAST(SPLIT_PART(wo_no, '-', 3) AS INTEGER)), 0) + 1 INTO v_next
  FROM app.work_order
  WHERE wo_no LIKE 'WO-' || v_yymm || '-%' AND wo_no ~ ('^WO-' || v_yymm || '-[0-9]+$');

  -- ── 2. createFromBomLine: khoá theo dòng + chặn YCSX DRAFT trùng ──
  PERFORM pg_advisory_xact_lock(hashtext('wo-bom-line:' || v_line));
  SELECT count(*) INTO v_cnt FROM app.work_order WHERE bom_line_id = v_line AND status = 'DRAFT';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'SMOKE FAIL 2: dòng BOM mới mà đã có YCSX DRAFT'; END IF;

  INSERT INTO app.work_order (wo_no, product_item_id, planned_qty, status, created_by, bom_template_id, bom_line_id)
  VALUES ('WO-' || v_yymm || '-' || lpad(v_next::text, 4, '0'), v_item, 5, 'DRAFT', v_user, v_tpl, v_line)
  RETURNING id INTO v_wo_bom;

  SELECT count(*) INTO v_cnt FROM app.work_order WHERE bom_line_id = v_line AND status = 'DRAFT';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 2: kiểm trùng YCSX phải thấy đúng 1 DRAFT, thấy %', v_cnt; END IF;
  RAISE NOTICE 'OK 1-2: số WO kế tiếp = WO-%-% (giờ VN), kiểm YCSX trùng theo dòng BOM hoạt động',
    v_yymm, lpad(v_next::text, 4, '0');

  -- ── 3. Backfill (chạy lại đúng câu UPDATE của 0066 — idempotent) ──
  INSERT INTO app.work_order (wo_no, product_item_id, planned_qty, status, created_by)
  VALUES ('SMOKE4-META', v_item, 1, 'RELEASED', v_user) RETURNING id INTO v_wo_meta;
  UPDATE app.bom_line SET metadata = jsonb_build_object('kind','fab','routing',
         jsonb_build_object('linkedWorkOrderId', v_wo_meta::text))
  WHERE id = v_line2;

  INSERT INTO app.work_order (wo_no, product_item_id, planned_qty, status, created_by)
  VALUES ('SMOKE4-AUDIT', v_item, 1, 'DRAFT', v_user) RETURNING id INTO v_wo_audit;
  INSERT INTO app.audit_event (actor_user_id, action, object_type, object_id, after_json)
  VALUES (v_user, 'CREATE', 'work_order', v_wo_audit,
          jsonb_build_object('woNo','SMOKE4-AUDIT','bomLineId', v_line::text));

  INSERT INTO app.work_order (wo_no, product_item_id, planned_qty, status, created_by)
  VALUES ('SMOKE4-FREE', v_item, 1, 'DRAFT', v_user) RETURNING id INTO v_wo_free;

  UPDATE app.work_order wo
  SET bom_line_id = bl.id, bom_template_id = bl.template_id
  FROM app.bom_line bl
  WHERE (bl.metadata #>> '{routing,linkedWorkOrderId}') = wo.id::text
    AND wo.bom_line_id IS NULL;

  UPDATE app.work_order wo
  SET bom_line_id = src.line_id, bom_template_id = src.template_id
  FROM (
    SELECT DISTINCT ON (ae.object_id) ae.object_id AS wo_id, bl.id AS line_id, bl.template_id
    FROM app.audit_event ae
    JOIN app.bom_line bl ON bl.id::text = (ae.after_json ->> 'bomLineId')
    WHERE ae.object_type = 'work_order' AND ae.action = 'CREATE'
      AND ae.object_id IS NOT NULL
      AND (ae.after_json ->> 'bomLineId') ~* '^[0-9a-f-]{36}$'
    ORDER BY ae.object_id, ae.occurred_at
  ) src
  WHERE src.wo_id = wo.id AND wo.bom_line_id IS NULL;

  SELECT bom_template_id, bom_line_id INTO v_tid, v_lid FROM app.work_order WHERE id = v_wo_meta;
  IF v_tid IS DISTINCT FROM v_tpl OR v_lid IS DISTINCT FROM v_line2 THEN
    RAISE EXCEPTION 'SMOKE FAIL 3: backfill metadata.linkedWorkOrderId sai (% / %)', v_tid, v_lid;
  END IF;
  SELECT bom_template_id, bom_line_id INTO v_tid, v_lid FROM app.work_order WHERE id = v_wo_audit;
  IF v_tid IS DISTINCT FROM v_tpl OR v_lid IS DISTINCT FROM v_line THEN
    RAISE EXCEPTION 'SMOKE FAIL 3: backfill audit bomLineId sai (% / %)', v_tid, v_lid;
  END IF;
  SELECT bom_template_id INTO v_tid FROM app.work_order WHERE id = v_wo_free;
  IF v_tid IS NOT NULL THEN RAISE EXCEPTION 'SMOKE FAIL 3: WO độc lập bị gán BOM'; END IF;
  RAISE NOTICE 'OK 3: backfill metadata + audit đúng, WO độc lập không bị gán';

  -- ── 4. Lọc WO theo BOM đúng câu của listWorkOrders / summary (SX-16) ──
  SELECT count(*) INTO v_cnt
  FROM app.work_order wo
  LEFT JOIN app.sales_order so ON so.id = wo.linked_order_id
  WHERE (wo.bom_template_id = v_tpl OR so.bom_template_id = v_tpl);
  IF v_cnt <> 3 THEN RAISE EXCEPTION 'SMOKE FAIL 4: tab BOM phải thấy 3 WO, thấy %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM app.work_order wo
  LEFT JOIN app.sales_order so ON so.id = wo.linked_order_id
  WHERE (wo.bom_template_id = v_tpl OR so.bom_template_id = v_tpl)
    AND wo.status NOT IN ('COMPLETED', 'CANCELLED');
  IF v_cnt <> 3 THEN RAISE EXCEPTION 'SMOKE FAIL 4: chip "Lệnh SX" phải = 3, thấy %', v_cnt; END IF;
  RAISE NOTICE 'OK 4: WO tạo từ chính BOM hiện trong tab / chip Lệnh SX (không cần đơn hàng bán)';

  -- ── 5. Supersede revision (SX-32): chỉ 1 bản RELEASED ──
  INSERT INTO app.bom_revision (template_id, revision_no, status, released_at)
  VALUES (v_tpl, 'R01', 'RELEASED', now()) RETURNING id INTO v_rev1;
  PERFORM 1 FROM app.bom_template WHERE id = v_tpl FOR UPDATE;
  UPDATE app.bom_revision SET status = 'SUPERSEDED'
  WHERE template_id = v_tpl AND status = 'RELEASED';
  INSERT INTO app.bom_revision (template_id, revision_no, status, released_at)
  VALUES (v_tpl, 'R02', 'RELEASED', now()) RETURNING id INTO v_rev2;
  SELECT count(*) INTO v_cnt FROM app.bom_revision WHERE template_id = v_tpl AND status = 'RELEASED';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 5: phải còn đúng 1 RELEASED, thấy %', v_cnt; END IF;
  RAISE NOTICE 'OK 5: phát hành R02 → R01 SUPERSEDED, còn 1 RELEASED';

  -- ── 6. FK ON DELETE SET NULL: xoá dòng/BOM không xoá lệnh ──
  DELETE FROM app.bom_line WHERE id = v_line;
  SELECT bom_template_id, bom_line_id INTO v_tid, v_lid FROM app.work_order WHERE id = v_wo_bom;
  IF v_lid IS NOT NULL OR v_tid IS DISTINCT FROM v_tpl THEN
    RAISE EXCEPTION 'SMOKE FAIL 6: xoá dòng BOM phải NULL bom_line_id, giữ bom_template_id (% / %)', v_tid, v_lid;
  END IF;
  DELETE FROM app.bom_revision WHERE template_id = v_tpl;
  DELETE FROM app.bom_template WHERE id = v_tpl;
  SELECT count(*) INTO v_cnt FROM app.work_order WHERE id IN (v_wo_bom, v_wo_meta, v_wo_audit);
  IF v_cnt <> 3 THEN RAISE EXCEPTION 'SMOKE FAIL 6: xoá BOM làm mất lệnh SX'; END IF;
  SELECT count(*) INTO v_cnt FROM app.work_order
  WHERE id IN (v_wo_bom, v_wo_meta, v_wo_audit) AND bom_template_id IS NOT NULL;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'SMOKE FAIL 6: xoá BOM phải NULL bom_template_id'; END IF;
  RAISE NOTICE 'OK 6: FK SET NULL — xoá dòng/BOM giữ nguyên lệnh SX';

  -- ── 7. reservation_lock gọi được (huỷ WO nhả giữ chỗ khoá theo item) ──
  PERFORM app.reservation_lock(v_item);
  RAISE NOTICE 'OK 7: app.reservation_lock(item) chạy được';
END $$;

ROLLBACK;
