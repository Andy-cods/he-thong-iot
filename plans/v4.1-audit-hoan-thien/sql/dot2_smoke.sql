-- ════════════════════════════════════════════════════════════════════
-- V4.1 Đợt 2 — SMOKE TEST TAY cho migration 0062_dot2_thu_mua.sql + các
-- truy vấn / hàm DB mà code Đợt 2 gọi THẬT (bài học Đợt 1: smoke phải chạy
-- đúng hàm/khoá code dùng, không chỉ insert thô).
--
-- Chạy SAU khi apply 0062 (script tự ROLLBACK, KHÔNG để lại dữ liệu):
--
--   docker cp plans/v4.1-audit-hoan-thien/sql/dot2_smoke.sql iot_postgres:/tmp/
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
--     -v ON_ERROR_STOP=1 -f /tmp/dot2_smoke.sql
--
-- Kết quả mong đợi: các NOTICE "OK …", cuối cùng ROLLBACK.
-- Bất kỳ 'SMOKE FAIL …' nào = migration / truy vấn sai.
-- ════════════════════════════════════════════════════════════════════

BEGIN;
SET search_path TO app, public;
SET LOCAL lock_timeout = '5s';

-- ── 0. Đối tượng migration ──────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('app.fin_invoice_po_active_uk') IS NULL THEN
    RAISE WARNING '0: KHÔNG có fin_invoice_po_active_uk (dữ liệu cũ trùng? xem NOTICE lúc apply) — code vẫn chặn';
  ELSE
    RAISE NOTICE 'OK 0a: fin_invoice_po_active_uk tồn tại';
  END IF;
  IF to_regclass('app.inbound_receipt_line_po_line_fail_idx') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL 0: thiếu inbound_receipt_line_po_line_fail_idx';
  END IF;
  RAISE NOTICE 'OK 0b: index QC FAIL theo dòng PO tồn tại';
END $$;

-- ── 1..9. Luồng PR → PO → nhận hàng (1 đạt + 1 NG) → HĐ mua ─────────
DO $$
DECLARE
  v_user  UUID;
  v_item  UUID;
  v_item2 UUID;
  v_sup   UUID;
  v_pr    UUID;
  v_pr_code TEXT;
  v_paper TEXT;
  v_po    UUID;
  v_po_no TEXT;
  v_pol1  UUID;
  v_pol2  UUID;
  v_rcv   UUID;
  v_rcv_no TEXT;
  v_inv   UUID;
  v_inv2  UUID;
  v_max   INT;
  v_status TEXT;
  v_accepted NUMERIC;
  v_rejected NUMERIC;
  v_blocked BOOLEAN := false;
  v_cnt   INT;
  v_bl    UUID;
  v_tpl   UUID;
BEGIN
  SELECT id INTO v_user FROM app.user_account ORDER BY created_at LIMIT 1;
  SELECT id INTO v_item FROM app.item ORDER BY created_at LIMIT 1;
  SELECT id INTO v_item2 FROM app.item WHERE id <> v_item ORDER BY created_at LIMIT 1;
  IF v_user IS NULL OR v_item IS NULL OR v_item2 IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: DB không có user / 2 item để test';
  END IF;

  INSERT INTO app.supplier (code, name) VALUES ('SMOKE-DOT2', 'NCC smoke Đợt 2')
  RETURNING id INTO v_sup;

  -- 1) PR: gen_pr_code() + khoá số phiếu giấy + gen_pr_paper_form_no() (submitPR)
  SELECT app.gen_pr_code() INTO v_pr_code;
  PERFORM pg_advisory_xact_lock(hashtext('pr_paper_form:' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MMYY')));
  SELECT app.gen_pr_paper_form_no() INTO v_paper;
  INSERT INTO app.purchase_request (code, title, status, source, requested_by, paper_form_no, approval_step)
  VALUES (v_pr_code, 'SMOKE Đợt 2', 'SUBMITTED', 'MANUAL', v_user, v_paper, 'SUBMITTED')
  RETURNING id INTO v_pr;
  INSERT INTO app.purchase_request_line (pr_id, line_no, item_id, qty, approved_qty, estimated_unit_price, preferred_supplier_id)
  VALUES (v_pr, 1, v_item, 10, 8, 1500, v_sup),
         (v_pr, 2, v_item2, 5, NULL, 200, v_sup);

  -- TM-11: guard sửa PR theo bước duyệt (đúng biểu thức route PATCH dùng)
  UPDATE app.purchase_request SET approval_step = 'DEPT_APPROVED', dept_approved_by = v_user WHERE id = v_pr;
  UPDATE app.purchase_request SET title = 'không được sửa'
   WHERE id = v_pr AND status IN ('DRAFT','SUBMITTED')
     AND COALESCE(approval_step::text, 'DRAFT') IN ('DRAFT','SUBMITTED');
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'SMOKE FAIL 1: sửa được PR đã qua Kho duyệt (TM-11)'; END IF;
  UPDATE app.purchase_request SET status = 'APPROVED', approval_step = 'DIRECTOR_APPROVED' WHERE id = v_pr;
  RAISE NOTICE 'OK 1: PR % (số giấy %) — gen_pr_code/gen_pr_paper_form_no chạy, guard TM-11 đúng', v_pr_code, v_paper;

  -- 2) createPOFromPR: khoá PR FOR UPDATE + genDocNo (advisory 'docno:' + MAX)
  PERFORM 1 FROM app.purchase_request WHERE id = v_pr FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtext('docno:PO-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM') || '-SMK2'));
  SELECT COALESCE(MAX(CAST(SPLIT_PART(po_no, '-', 4) AS INTEGER)), 0) INTO v_max
    FROM app.purchase_order
   WHERE po_no LIKE 'PO-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM') || '-SMK2-%';
  v_po_no := 'PO-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM') || '-SMK2-' || lpad((v_max + 1)::text, 2, '0');
  INSERT INTO app.purchase_order (po_no, supplier_id, pr_id, status, created_by, payment_terms, total_amount)
  VALUES (v_po_no, v_sup, v_pr, 'DRAFT', v_user, 'Net 30', 0)
  RETURNING id INTO v_po;
  -- TM-10: SL duyệt 8 (không phải 10) + đơn giá dự kiến 1500; dòng 2 VAT 0
  INSERT INTO app.purchase_order_line (po_id, line_no, item_id, ordered_qty, unit_price, tax_rate, line_total)
  VALUES (v_po, 1, v_item, 8, 1500, 8, 12960) RETURNING id INTO v_pol1;
  INSERT INTO app.purchase_order_line (po_id, line_no, item_id, ordered_qty, unit_price, tax_rate, line_total)
  VALUES (v_po, 2, v_item2, 5, 200, 0, 1000) RETURNING id INTO v_pol2;
  UPDATE app.purchase_order SET total_amount = 13960 WHERE id = v_po;
  UPDATE app.purchase_request SET status = 'CONVERTED', approval_step = 'CONVERTED', po_created_at = now() WHERE id = v_pr;
  RAISE NOTICE 'OK 2: PO % tạo từ PR (khoá PR + docno lock)', v_po_no;

  -- 3) Gửi duyệt / duyệt / gửi NCC (đúng điều kiện UPDATE của repo)
  UPDATE app.purchase_order
     SET metadata = (metadata - 'rejectedBy' - 'rejectedAt') || jsonb_build_object('approvalStatus','pending','submittedBy', v_user::text)
   WHERE id = v_po AND status = 'DRAFT' AND coalesce(metadata ->> 'approvalStatus','') IN ('','rejected');
  UPDATE app.purchase_order
     SET metadata = metadata || jsonb_build_object('approvalStatus','approved','approvedBy', v_user::text)
   WHERE id = v_po AND status = 'DRAFT' AND metadata ->> 'approvalStatus' = 'pending';
  UPDATE app.purchase_order SET status = 'SENT', sent_at = now()
   WHERE id = v_po AND status = 'DRAFT' AND metadata ->> 'approvalStatus' = 'approved';
  SELECT status INTO v_status FROM app.purchase_order WHERE id = v_po;
  IF v_status <> 'SENT' THEN RAISE EXCEPTION 'SMOKE FAIL 3: PO không sang SENT (%)', v_status; END IF;
  RAISE NOTICE 'OK 3: DRAFT → pending → approved → SENT';

  -- 4) Nhận hàng: khoá PO rồi dòng PO (thứ tự postReceivingAtomic) + phiếu nhập
  --    theo ngày GIỜ VN (TM-24) + dòng 1 nhận 8 trong đó 3 NG (2 dòng phiếu).
  PERFORM 1 FROM app.purchase_order WHERE id = v_po FOR UPDATE;
  PERFORM 1 FROM app.purchase_order_line WHERE id = v_pol1 FOR UPDATE;
  PERFORM app.reservation_lock(v_item);   -- QC route / guard xuất khoá theo item (0061)
  v_rcv_no := 'RCV-SMOKE-DOT2-' || substr(md5(random()::text), 1, 6);
  INSERT INTO app.inbound_receipt (receipt_no, po_id, received_by) VALUES (v_rcv_no, v_po, v_user)
  RETURNING id INTO v_rcv;
  SELECT COUNT(*) INTO v_cnt FROM app.inbound_receipt
   WHERE po_id = v_po
     AND (received_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 4: không tìm lại phiếu nhập hôm nay theo giờ VN (TM-24)'; END IF;
  INSERT INTO app.inbound_receipt_line (receipt_id, po_line_id, item_id, received_qty, qc_status)
  VALUES (v_rcv, v_pol1, v_item, 5, 'PASS'),
         (v_rcv, v_pol1, v_item, 3, 'FAIL');
  UPDATE app.purchase_order_line SET received_qty = received_qty + 8 WHERE id = v_pol1;

  -- Truy vấn getPOLineReceiptStats (y hệt code)
  SELECT pol.received_qty - COALESCE((SELECT SUM(rl.received_qty) FROM app.inbound_receipt_line rl
                                       WHERE rl.po_line_id = pol.id AND rl.qc_status = 'FAIL'), 0),
         COALESCE((SELECT SUM(rl.received_qty) FROM app.inbound_receipt_line rl
                    WHERE rl.po_line_id = pol.id AND rl.qc_status = 'FAIL'), 0)
    INTO v_accepted, v_rejected
    FROM app.purchase_order_line pol WHERE pol.id = v_pol1;
  IF v_accepted <> 5 OR v_rejected <> 3 THEN
    RAISE EXCEPTION 'SMOKE FAIL 4: accepted/rejected sai (% / %)', v_accepted, v_rejected;
  END IF;
  -- Dòng 1 chưa đủ hàng đạt (5/8), dòng 2 = 0 → PO chỉ PARTIAL (TM-15/16)
  UPDATE app.purchase_order SET status = 'PARTIAL' WHERE id = v_po AND status = 'SENT';
  RAISE NOTICE 'OK 4: nhận 8 (3 NG) → đạt 5/8, PO PARTIAL; phiếu nhập nhóm theo ngày VN';

  -- 5) Lọc PO quá hạn + lọc BOM qua metadata + prCode export (biểu thức code dùng)
  UPDATE app.purchase_order SET expected_eta = CURRENT_DATE - 3 WHERE id = v_po;
  SELECT COUNT(*) INTO v_cnt FROM app.purchase_order po
   WHERE po.id = v_po AND po.status IN ('SENT','PARTIAL') AND po.expected_eta IS NOT NULL AND po.expected_eta < CURRENT_DATE;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 5: lọc overdue không bắt PO quá hạn'; END IF;
  SELECT COUNT(*) INTO v_cnt FROM app.purchase_order po
   WHERE po.id = v_po
     AND (SELECT COALESCE(pr.paper_form_no, pr.code) FROM app.purchase_request pr WHERE pr.id = po.pr_id) = v_paper;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 5: cột Số phiếu PR (export) sai'; END IF;
  RAISE NOTICE 'OK 5: overdue + prCode export';

  -- 6) D7: HĐ mua nháp từ PO — khoá PO + insert; HĐ thứ 2 cùng PO → 23505
  PERFORM 1 FROM app.purchase_order WHERE id = v_po FOR UPDATE;
  INSERT INTO app.fin_invoice (invoice_no, direction, supplier_id, purchase_order_id, issue_date, due_date,
                               subtotal_amount, vat_rate, vat_amount, total_amount, status, notes, created_by)
  VALUES (v_po_no, 'IN', v_sup, v_po, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 30, 7500, 8, 600, 8100, 'DRAFT',
          'Tạo từ PO ' || v_po_no, v_user)
  RETURNING id INTO v_inv;
  IF to_regclass('app.fin_invoice_po_active_uk') IS NOT NULL THEN
    BEGIN
      INSERT INTO app.fin_invoice (invoice_no, direction, supplier_id, purchase_order_id, issue_date,
                                   subtotal_amount, vat_rate, vat_amount, total_amount, status)
      VALUES (v_po_no || '-B', 'IN', v_sup, v_po, CURRENT_DATE, 1, 0, 0, 1, 'DRAFT');
    EXCEPTION WHEN unique_violation THEN v_blocked := true;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'SMOKE FAIL 6: tạo được HĐ thứ 2 cho cùng PO'; END IF;
  END IF;
  -- HĐ nháp KHÔNG vào công nợ (aging lọc UNPAID/PARTIAL/OVERDUE)
  SELECT COUNT(*) INTO v_cnt FROM app.fin_invoice
   WHERE id = v_inv AND direction = 'IN' AND status IN ('UNPAID','PARTIAL','OVERDUE');
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'SMOKE FAIL 6: HĐ nháp lọt vào công nợ'; END IF;
  -- Xác nhận: khoá HĐ + UPDATE có điều kiện DRAFT (updatePoInvoiceDraft)
  PERFORM 1 FROM app.fin_invoice WHERE id = v_inv FOR UPDATE;
  UPDATE app.fin_invoice SET invoice_no = 'HD-NCC-SMOKE-001', status = 'UNPAID', updated_at = now()
   WHERE id = v_inv AND status = 'DRAFT';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 6: không xác nhận được HĐ nháp'; END IF;
  SELECT COUNT(*) INTO v_cnt FROM app.fin_invoice
   WHERE id = v_inv AND direction = 'IN' AND status IN ('UNPAID','PARTIAL','OVERDUE');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 6: HĐ đã xác nhận không vào công nợ'; END IF;
  -- Huỷ HĐ → được tạo HĐ mới cho PO (index partial loại CANCELLED)
  UPDATE app.fin_invoice SET status = 'CANCELLED' WHERE id = v_inv;
  INSERT INTO app.fin_invoice (invoice_no, direction, supplier_id, purchase_order_id, issue_date,
                               subtotal_amount, vat_rate, vat_amount, total_amount, status)
  VALUES (v_po_no || '-C', 'IN', v_sup, v_po, CURRENT_DATE, 1, 0, 0, 1, 'DRAFT')
  RETURNING id INTO v_inv2;
  RAISE NOTICE 'OK 6: D7 — 1 HĐ/PO, nháp ngoài công nợ, xác nhận → UNPAID, huỷ rồi tạo lại được';

  -- 7) Đóng PO (TM-17): PARTIAL → CLOSED; nhận hàng tiếp bị chặn ở code (RECEIVABLE)
  PERFORM 1 FROM app.purchase_order WHERE id = v_po FOR UPDATE;
  UPDATE app.purchase_order
     SET status = 'CLOSED',
         actual_delivery_date = COALESCE(actual_delivery_date, CURRENT_DATE),
         metadata = metadata || jsonb_build_object('closedBy', v_user::text, 'closedReason', 'smoke', 'closedFromStatus', 'PARTIAL')
   WHERE id = v_po AND status IN ('PARTIAL','RECEIVED');
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 7: không đóng được PO PARTIAL'; END IF;
  RAISE NOTICE 'OK 7: đóng PO PARTIAL → CLOSED';

  -- 8) Dashboard: truy vấn Đặt mua / Nhận hàng mới chạy được
  PERFORM
    (SELECT COUNT(*) FILTER (WHERE status IN ('SENT','PARTIAL','RECEIVED','CLOSED'))
       FROM app.purchase_order WHERE status <> 'CANCELLED'),
    COUNT(*) FILTER (WHERE pol.received_qty - COALESCE(f.rejected, 0) >= pol.ordered_qty)
  FROM app.purchase_order_line pol
  JOIN app.purchase_order po ON po.id = pol.po_id
  LEFT JOIN (SELECT po_line_id, SUM(received_qty) AS rejected FROM app.inbound_receipt_line
              WHERE qc_status = 'FAIL' GROUP BY po_line_id) f ON f.po_line_id = pol.id
  WHERE po.status IN ('SENT','PARTIAL','RECEIVED','CLOSED');
  RAISE NOTICE 'OK 8: truy vấn dashboard PO chạy';

  -- 9) Backfill PO ↔ BOM từ audit_event (statement y hệt 0062) — nếu có bom_line
  SELECT id, template_id INTO v_bl, v_tpl FROM app.bom_line LIMIT 1;
  IF v_bl IS NULL THEN
    RAISE NOTICE 'SKIP 9: DB không có bom_line';
  ELSE
    INSERT INTO app.audit_event (actor_user_id, action, object_type, object_id, after_json)
    VALUES (v_user, 'CREATE', 'purchase_order', v_po, jsonb_build_object('poNo', v_po_no, 'bomLineId', v_bl::text));
    UPDATE app.purchase_order po
       SET metadata = COALESCE(po.metadata, '{}'::jsonb)
                      || jsonb_build_object('bomLineId', src.bom_line_id::text, 'bomTemplateId', src.template_id::text)
      FROM (
        SELECT DISTINCT ON (ae.object_id) ae.object_id AS po_id, bl.id AS bom_line_id, bl.template_id
        FROM app.audit_event ae
        JOIN app.bom_line bl ON bl.id::text = ae.after_json ->> 'bomLineId'
        WHERE ae.object_type = 'purchase_order' AND ae.action = 'CREATE'
          AND ae.after_json ? 'bomLineId'
          AND (ae.after_json ->> 'bomLineId') ~* '^[0-9a-f-]{36}$'
        ORDER BY ae.object_id, ae.occurred_at
      ) src
     WHERE po.id = src.po_id AND NOT (COALESCE(po.metadata, '{}'::jsonb) ? 'bomTemplateId');
    SELECT COUNT(*) INTO v_cnt FROM app.purchase_order po
     WHERE po.id = v_po AND po.metadata ->> 'bomTemplateId' = v_tpl::text;
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'SMOKE FAIL 9: backfill metadata.bomTemplateId không chạy'; END IF;
    RAISE NOTICE 'OK 9: backfill PO ↔ BOM qua audit_event';
  END IF;
END $$;

ROLLBACK;
