-- =============================================================
-- Migration 0007a · V1.4 Phase B — RLS policies 10 bảng × 4 role
-- =============================================================
-- User chạy: postgres (superuser).
--   Lý do: CREATE ROLE + ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--          + GRANT trên schema cần superuser privilege.
-- Idempotent: DO block `IF NOT EXISTS` + DROP POLICY IF EXISTS + CREATE POLICY.
--
-- Chiến lược V1.4 (theo plan §6 Phase B):
--   1) 4 app role (NOLOGIN, dùng SET LOCAL ROLE per-request):
--        iot_admin, iot_planner, iot_operator, iot_warehouse.
--   2) 10 bảng nghiệp vụ chính: item, supplier, bom_template, bom_revision,
--      sales_order, bom_snapshot_line, work_order, reservation, eco_change,
--      audit_event.
--   3) ENABLE RLS (KHÔNG FORCE — connection pool app (hethong_app) vẫn bypass
--      khi `RLS_ENABLED=false` flag trong ENV. Khi bật flag, app SET LOCAL
--      ROLE iot_<role> đầu transaction → policies fire.
--   4) Policy matrix per table theo brainstorm §4:
--        - admin: FOR ALL USING (true) WITH CHECK (true).
--        - planner: CRUD nghiệp vụ (item/supplier/bom/order/snapshot/WO/PR/eco).
--        - operator: SELECT + UPDATE (transition state).
--        - warehouse: SELECT + UPDATE (PO receiving + snapshot AVAILABLE).
--
-- Rollback: DROP POLICY per table + DISABLE RLS + DROP ROLE (xem 0007a_down).
-- =============================================================

-- -----------------------------------------------------------------
-- 1) Tạo 4 app role (NOLOGIN, không đăng nhập trực tiếp).
-- -----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iot_admin') THEN
    CREATE ROLE iot_admin NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iot_planner') THEN
    CREATE ROLE iot_planner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iot_operator') THEN
    CREATE ROLE iot_operator NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iot_warehouse') THEN
    CREATE ROLE iot_warehouse NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Cho phép app role có thể được SET ROLE từ hethong_app.
GRANT iot_admin     TO hethong_app;
GRANT iot_planner   TO hethong_app;
GRANT iot_operator  TO hethong_app;
GRANT iot_warehouse TO hethong_app;

-- -----------------------------------------------------------------
-- 2) GRANT CONNECT + USAGE schema app + baseline privilege.
-- -----------------------------------------------------------------
GRANT USAGE ON SCHEMA app TO iot_admin, iot_planner, iot_operator, iot_warehouse;

-- admin = full privilege (DML + sequence). Policy vẫn là lớp gác tiếp theo.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO iot_admin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA app TO iot_admin;

-- planner = SELECT/INSERT/UPDATE full (DELETE không cho ở privilege level,
-- policy sẽ chặn DELETE cho planner trên table không có quyền).
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO iot_planner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO iot_planner;

-- operator/warehouse = SELECT full + UPDATE (state transition).
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA app TO iot_operator, iot_warehouse;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO iot_operator, iot_warehouse;

-- Default cho table mới sau này (V1.5+).
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO iot_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE ON TABLES TO iot_planner;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, UPDATE ON TABLES TO iot_operator, iot_warehouse;

-- -----------------------------------------------------------------
-- 3) ENABLE ROW LEVEL SECURITY trên 10 bảng nghiệp vụ.
--    KHÔNG FORCE vì owner (hethong_app) bypass khi chạy SET ROLE, giữ
--    đường thoát cho migration/maintenance.
-- -----------------------------------------------------------------
ALTER TABLE app.item               ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.supplier           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bom_template       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bom_revision       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sales_order        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bom_snapshot_line  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.work_order         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reservation        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.eco_change         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_event        ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------
-- 4) POLICIES — pattern: 1 admin_all + 3 role-specific per table.
--    Idempotent: DROP trước CREATE.
-- -----------------------------------------------------------------

-- === item ========================================================
DROP POLICY IF EXISTS item_admin_all ON app.item;
CREATE POLICY item_admin_all ON app.item
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS item_planner_rw ON app.item;
CREATE POLICY item_planner_rw ON app.item
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS item_ops_read ON app.item;
CREATE POLICY item_ops_read ON app.item
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

-- === supplier ====================================================
DROP POLICY IF EXISTS supplier_admin_all ON app.supplier;
CREATE POLICY supplier_admin_all ON app.supplier
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS supplier_planner_rw ON app.supplier;
CREATE POLICY supplier_planner_rw ON app.supplier
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS supplier_warehouse_read ON app.supplier;
CREATE POLICY supplier_warehouse_read ON app.supplier
  FOR SELECT TO iot_warehouse USING (true);

-- === bom_template ================================================
DROP POLICY IF EXISTS bom_template_admin_all ON app.bom_template;
CREATE POLICY bom_template_admin_all ON app.bom_template
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bom_template_planner_rw ON app.bom_template;
CREATE POLICY bom_template_planner_rw ON app.bom_template
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bom_template_ops_read ON app.bom_template;
CREATE POLICY bom_template_ops_read ON app.bom_template
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

-- === bom_revision ================================================
DROP POLICY IF EXISTS bom_revision_admin_all ON app.bom_revision;
CREATE POLICY bom_revision_admin_all ON app.bom_revision
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bom_revision_planner_rw ON app.bom_revision;
CREATE POLICY bom_revision_planner_rw ON app.bom_revision
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bom_revision_ops_read ON app.bom_revision;
CREATE POLICY bom_revision_ops_read ON app.bom_revision
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

-- === sales_order =================================================
DROP POLICY IF EXISTS sales_order_admin_all ON app.sales_order;
CREATE POLICY sales_order_admin_all ON app.sales_order
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sales_order_planner_rw ON app.sales_order;
CREATE POLICY sales_order_planner_rw ON app.sales_order
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sales_order_ops_read ON app.sales_order;
CREATE POLICY sales_order_ops_read ON app.sales_order
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

-- === bom_snapshot_line ===========================================
DROP POLICY IF EXISTS snapshot_line_admin_all ON app.bom_snapshot_line;
CREATE POLICY snapshot_line_admin_all ON app.bom_snapshot_line
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS snapshot_line_planner_rw ON app.bom_snapshot_line;
CREATE POLICY snapshot_line_planner_rw ON app.bom_snapshot_line
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

-- operator + warehouse: SELECT + UPDATE (transition state).
DROP POLICY IF EXISTS snapshot_line_ops_read ON app.bom_snapshot_line;
CREATE POLICY snapshot_line_ops_read ON app.bom_snapshot_line
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

DROP POLICY IF EXISTS snapshot_line_ops_update ON app.bom_snapshot_line;
CREATE POLICY snapshot_line_ops_update ON app.bom_snapshot_line
  FOR UPDATE TO iot_operator, iot_warehouse USING (true) WITH CHECK (true);

-- === work_order ==================================================
DROP POLICY IF EXISTS work_order_admin_all ON app.work_order;
CREATE POLICY work_order_admin_all ON app.work_order
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS work_order_planner_rw ON app.work_order;
CREATE POLICY work_order_planner_rw ON app.work_order
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

-- operator: SELECT + UPDATE (start/pause/complete transition).
DROP POLICY IF EXISTS work_order_operator_read ON app.work_order;
CREATE POLICY work_order_operator_read ON app.work_order
  FOR SELECT TO iot_operator USING (true);

DROP POLICY IF EXISTS work_order_operator_update ON app.work_order;
CREATE POLICY work_order_operator_update ON app.work_order
  FOR UPDATE TO iot_operator USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS work_order_warehouse_read ON app.work_order;
CREATE POLICY work_order_warehouse_read ON app.work_order
  FOR SELECT TO iot_warehouse USING (true);

-- === reservation =================================================
DROP POLICY IF EXISTS reservation_admin_all ON app.reservation;
CREATE POLICY reservation_admin_all ON app.reservation
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS reservation_planner_rw ON app.reservation;
CREATE POLICY reservation_planner_rw ON app.reservation
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

-- operator: SELECT + UPDATE (release / consume reservation).
DROP POLICY IF EXISTS reservation_operator_read ON app.reservation;
CREATE POLICY reservation_operator_read ON app.reservation
  FOR SELECT TO iot_operator USING (true);

DROP POLICY IF EXISTS reservation_operator_update ON app.reservation;
CREATE POLICY reservation_operator_update ON app.reservation
  FOR UPDATE TO iot_operator USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS reservation_warehouse_read ON app.reservation;
CREATE POLICY reservation_warehouse_read ON app.reservation
  FOR SELECT TO iot_warehouse USING (true);

-- === eco_change ==================================================
DROP POLICY IF EXISTS eco_admin_all ON app.eco_change;
CREATE POLICY eco_admin_all ON app.eco_change
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS eco_planner_rw ON app.eco_change;
CREATE POLICY eco_planner_rw ON app.eco_change
  FOR ALL TO iot_planner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS eco_ops_read ON app.eco_change;
CREATE POLICY eco_ops_read ON app.eco_change
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

-- === audit_event =================================================
-- Tất cả role đều đọc; INSERT chỉ server (hethong_app) bypass RLS khi
-- RLS_ENABLED=false, hoặc policy-level admin/planner được ghi.
DROP POLICY IF EXISTS audit_admin_all ON app.audit_event;
CREATE POLICY audit_admin_all ON app.audit_event
  FOR ALL TO iot_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS audit_planner_read_insert ON app.audit_event;
CREATE POLICY audit_planner_read_insert ON app.audit_event
  FOR SELECT TO iot_planner USING (true);

DROP POLICY IF EXISTS audit_planner_insert ON app.audit_event;
CREATE POLICY audit_planner_insert ON app.audit_event
  FOR INSERT TO iot_planner WITH CHECK (true);

DROP POLICY IF EXISTS audit_ops_read ON app.audit_event;
CREATE POLICY audit_ops_read ON app.audit_event
  FOR SELECT TO iot_operator, iot_warehouse USING (true);

DROP POLICY IF EXISTS audit_ops_insert ON app.audit_event;
CREATE POLICY audit_ops_insert ON app.audit_event
  FOR INSERT TO iot_operator, iot_warehouse WITH CHECK (true);

-- -----------------------------------------------------------------
-- 5) Smoke notice
-- -----------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'migration 0007a: RLS policies applied — 10 tables × avg 3 policy = ~33 policy. Apps cần SET LOCAL ROLE iot_<role> đầu transaction để policy fire. Flip ENV RLS_ENABLED=true khi sẵn sàng (xem 0007_README).';
END $$;
