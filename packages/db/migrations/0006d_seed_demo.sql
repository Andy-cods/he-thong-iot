-- =============================================================
-- Migration 0006d · V1.3 seed demo (app-user, idempotent, SKIP nếu thiếu data)
-- =============================================================
-- Mục tiêu: tạo 1 WO demo + QC check preset (3 checkpoint) cho order
-- đầu tiên có snapshot (nếu có). Nếu không có order/snapshot → skip.
-- =============================================================

DO $$
DECLARE
  v_order_id UUID;
  v_product_id UUID;
  v_wo_id UUID;
  v_wo_no VARCHAR(64);
  v_snapshot_count INT;
BEGIN
  -- Tìm 1 order có snapshot_lines để demo
  SELECT o.id, o.product_item_id
    INTO v_order_id, v_product_id
    FROM app.sales_order o
    JOIN app.bom_snapshot_line s ON s.order_id = o.id
   WHERE o.status IN ('SNAPSHOTTED', 'IN_PROGRESS', 'CONFIRMED')
   LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE '[0006d] SKIP: chưa có order + snapshot để seed WO demo';
    RETURN;
  END IF;

  -- Kiểm tra đã có WO demo chưa (idempotent)
  SELECT id INTO v_wo_id
    FROM app.work_order
   WHERE linked_order_id = v_order_id
     AND wo_no LIKE 'WO-DEMO-%'
   LIMIT 1;

  IF v_wo_id IS NOT NULL THEN
    RAISE NOTICE '[0006d] WO demo đã tồn tại: %', v_wo_id;
    RETURN;
  END IF;

  -- Tạo WO demo
  v_wo_no := 'WO-DEMO-' || to_char(now(), 'YYMMDD-HH24MISS');

  INSERT INTO app.work_order (
    wo_no, product_item_id, linked_order_id, planned_qty,
    status, priority, notes
  ) VALUES (
    v_wo_no, v_product_id, v_order_id, 1, 'DRAFT', 'NORMAL',
    'WO demo seed từ migration 0006d'
  ) RETURNING id INTO v_wo_id;

  -- Tạo work_order_line từ snapshot_lines level 1 (tối đa 5 line để demo gọn)
  INSERT INTO app.work_order_line (wo_id, snapshot_line_id, required_qty, position)
    SELECT v_wo_id, s.id, s.gross_required_qty, row_number() OVER (ORDER BY s.path)::int
      FROM app.bom_snapshot_line s
     WHERE s.order_id = v_order_id
       AND s.level = 1
     ORDER BY s.path
     LIMIT 5;

  GET DIAGNOSTICS v_snapshot_count = ROW_COUNT;

  -- Tạo 3 QC checkpoint preset (result = NULL để operator fill sau)
  INSERT INTO app.qc_check (wo_id, checkpoint_name, checkpoint, note) VALUES
    (v_wo_id, 'Pre-Assembly', 'PRE_ASSEMBLY', 'Kiểm tra đầu vào trước assembly'),
    (v_wo_id, 'Mid-Production', 'MID_PRODUCTION', 'Kiểm tra giữa chừng sản xuất'),
    (v_wo_id, 'Pre-FG', 'PRE_FG', 'Kiểm tra thành phẩm trước đóng gói');

  RAISE NOTICE '[0006d] Created WO demo % với % line + 3 QC checkpoint', v_wo_no, v_snapshot_count;
END $$;
