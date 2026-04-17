-- =============================================================
-- Migration 0003d · V1.1-alpha · Seed demo BOM + role fixups (APP USER)
-- =============================================================
-- Chạy bằng `hethong_app`.
-- Idempotent: mọi INSERT dùng ON CONFLICT DO NOTHING.
-- Mục tiêu:
--   1. Bảo đảm 4 role (admin/planner/warehouse/operator) tồn tại
--   2. Gắn user admin vào role admin nếu chưa
--   3. Seed 1 BOM demo "CNC-ABC-DEMO" với 3 component lấy từ item pool
-- =============================================================

-- 1) Roles -------------------------------------------------------------------
INSERT INTO app.role (code, display_name, description)
VALUES
  ('admin',    'Quản trị hệ thống', 'Toàn quyền'),
  ('planner',  'Kế hoạch sản xuất', 'Tạo/sửa BOM, đơn hàng'),
  ('warehouse','Thủ kho',           'Nhận hàng, kiểm kho'),
  ('operator', 'Công nhân vận hành','Quét mã, báo công đoạn')
ON CONFLICT (code) DO NOTHING;

-- 2) Gắn user admin vào role admin -------------------------------------------
INSERT INTO app.user_role (user_id, role_id, assigned_at)
SELECT u.id, r.id, now()
FROM app.user_account u
CROSS JOIN app.role r
WHERE u.username = 'admin' AND r.code = 'admin'
ON CONFLICT DO NOTHING;

-- 3) Seed BOM demo CNC-ABC-DEMO ---------------------------------------------
DO $$
DECLARE
  v_item_count   int;
  v_admin_id     uuid;
  v_template_id  uuid;
  v_parent_item  uuid;
  v_comp1        uuid;
  v_comp2        uuid;
  v_comp3        uuid;
BEGIN
  SELECT count(*) INTO v_item_count FROM app.item WHERE is_active = true;
  IF v_item_count < 4 THEN
    RAISE NOTICE 'skip seed demo BOM — cần ít nhất 4 item active, có %', v_item_count;
    RETURN;
  END IF;

  SELECT id INTO v_admin_id FROM app.user_account WHERE username = 'admin' LIMIT 1;

  SELECT id INTO v_parent_item FROM app.item WHERE is_active = true
    ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id INTO v_comp1 FROM app.item WHERE is_active = true
    ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO v_comp2 FROM app.item WHERE is_active = true
    ORDER BY created_at LIMIT 1 OFFSET 2;
  SELECT id INTO v_comp3 FROM app.item WHERE is_active = true
    ORDER BY created_at LIMIT 1 OFFSET 3;

  -- Chỉ seed nếu chưa tồn tại
  SELECT id INTO v_template_id
  FROM app.bom_template WHERE code = 'CNC-ABC-DEMO' LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO app.bom_template
      (code, name, description, parent_item_id, target_qty, status, created_by)
    VALUES
      ('CNC-ABC-DEMO', 'Máy CNC ABC (demo)',
       'BOM demo V1.1-alpha seed — dev tree editor test', v_parent_item, 1, 'DRAFT', v_admin_id)
    RETURNING id INTO v_template_id;

    INSERT INTO app.bom_line
      (template_id, parent_line_id, component_item_id, level, position, qty_per_parent, description)
    VALUES
      (v_template_id, NULL, v_comp1, 1, 1, 2, 'Linh kiện demo #1'),
      (v_template_id, NULL, v_comp2, 1, 2, 4, 'Linh kiện demo #2'),
      (v_template_id, NULL, v_comp3, 1, 3, 1, 'Linh kiện demo #3');

    RAISE NOTICE 'seed demo BOM CNC-ABC-DEMO OK (template=%)', v_template_id;
  ELSE
    RAISE NOTICE 'BOM CNC-ABC-DEMO đã tồn tại (skip)';
  END IF;
END $$;
