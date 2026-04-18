-- =============================================================
-- Migration 0005e · Indexes + Materialized View shortage (V1.2)
-- =============================================================
-- Scope:
--   1) Btree indexes trên FK + state columns cho perf
--   2) GIN trgm cho component_name (search trong snapshot)
--   3) GIST cho path (ltree tree query)
--   4) Materialized view app.shortage_aggregate
--   5) Function refresh_shortage_aggregate() — manual trigger (cron V1.3)
-- =============================================================

-- 1) BTree indexes bom_snapshot_line
CREATE INDEX IF NOT EXISTS bom_snapshot_line_order_idx
  ON app.bom_snapshot_line (order_id);

CREATE INDEX IF NOT EXISTS bom_snapshot_line_revision_idx
  ON app.bom_snapshot_line (revision_id);

CREATE INDEX IF NOT EXISTS bom_snapshot_line_parent_idx
  ON app.bom_snapshot_line (parent_snapshot_line_id);

CREATE INDEX IF NOT EXISTS bom_snapshot_line_component_idx
  ON app.bom_snapshot_line (component_item_id);

CREATE INDEX IF NOT EXISTS bom_snapshot_line_state_idx
  ON app.bom_snapshot_line (state);

CREATE INDEX IF NOT EXISTS bom_snapshot_line_order_state_idx
  ON app.bom_snapshot_line (order_id, state);

-- 2) Partial index: shortage-only lookup fast
CREATE INDEX IF NOT EXISTS bom_snapshot_line_short_idx
  ON app.bom_snapshot_line (component_item_id)
  WHERE remaining_short_qty > 0;

-- 3) GIST cho ltree path (tree ancestor/descendant query)
CREATE INDEX IF NOT EXISTS bom_snapshot_line_path_gist
  ON app.bom_snapshot_line USING GIST (path);

-- 4) GIN trgm cho component_name (search case-insensitive)
CREATE INDEX IF NOT EXISTS bom_snapshot_line_name_trgm
  ON app.bom_snapshot_line USING GIN (public.f_unaccent(component_name) gin_trgm_ops);

-- 5) Indexes purchase_request
CREATE INDEX IF NOT EXISTS pr_status_idx
  ON app.purchase_request (status);
CREATE INDEX IF NOT EXISTS pr_linked_order_idx
  ON app.purchase_request (linked_order_id);
CREATE INDEX IF NOT EXISTS pr_requested_by_idx
  ON app.purchase_request (requested_by);

CREATE INDEX IF NOT EXISTS pr_line_pr_idx
  ON app.purchase_request_line (pr_id);
CREATE INDEX IF NOT EXISTS pr_line_item_idx
  ON app.purchase_request_line (item_id);
CREATE INDEX IF NOT EXISTS pr_line_supplier_idx
  ON app.purchase_request_line (preferred_supplier_id);
CREATE INDEX IF NOT EXISTS pr_line_snapshot_idx
  ON app.purchase_request_line (snapshot_line_id);

-- 6) Indexes purchase_order (enhance)
CREATE INDEX IF NOT EXISTS po_pr_idx
  ON app.purchase_order (pr_id);
CREATE INDEX IF NOT EXISTS po_line_snapshot_idx
  ON app.purchase_order_line (snapshot_line_id);

-- 7) inventory_lot_serial.status
CREATE INDEX IF NOT EXISTS lot_serial_status_idx
  ON app.inventory_lot_serial (status);

-- 8) Materialized view shortage_aggregate
-- Xoá nếu tồn tại rồi tạo lại (giúp test repeatable).
DROP MATERIALIZED VIEW IF EXISTS app.shortage_aggregate;

CREATE MATERIALIZED VIEW app.shortage_aggregate AS
SELECT
  bsl.component_item_id        AS component_item_id,
  MIN(bsl.component_sku)       AS component_sku,
  MIN(bsl.component_name)      AS component_name,
  SUM(bsl.gross_required_qty)  AS total_required,
  SUM(bsl.qc_pass_qty)         AS total_available,
  SUM(bsl.open_purchase_qty)   AS total_on_order,
  SUM(bsl.remaining_short_qty) AS total_short,
  COUNT(DISTINCT bsl.order_id) AS order_count,
  MAX(bsl.updated_at)          AS last_update
FROM app.bom_snapshot_line bsl
WHERE bsl.state IN ('PLANNED', 'PURCHASING')
GROUP BY bsl.component_item_id
HAVING SUM(bsl.remaining_short_qty) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS shortage_aggregate_item_uk
  ON app.shortage_aggregate (component_item_id);

-- 9) Function refresh (manual; cron V1.3)
CREATE OR REPLACE FUNCTION app.refresh_shortage_aggregate()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY app.shortage_aggregate;
END;
$$;

-- Verify
DO $$
DECLARE idx_count integer;
BEGIN
  SELECT count(*) INTO idx_count FROM pg_indexes
    WHERE schemaname = 'app'
    AND (tablename IN ('bom_snapshot_line', 'purchase_request', 'purchase_request_line', 'purchase_order_line', 'inventory_lot_serial')
         OR tablename = 'shortage_aggregate');
  RAISE NOTICE 'migration 0005e: % indexes + mv shortage_aggregate created', idx_count;
END $$;
