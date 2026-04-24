-- ============================================================================
-- V1.9 Phase 6: Items list — category filter + tồn kho chính xác
-- ----------------------------------------------------------------------------
-- 1. Index `(category)` partial WHERE category IS NOT NULL để hỗ trợ
--    `GET /api/items/categories` (DISTINCT + COUNT group-by nhanh hơn seq scan).
-- 2. Index `(item_id, tx_type)` cho inventory_txn — aggregate per-item cần hit
--    index cho LATERAL subquery trong list items.
-- Idempotent: IF NOT EXISTS + CREATE INDEX CONCURRENTLY không dùng (vì chạy
-- trong transaction migration runner). Nếu bảng lớn → cân nhắc rebuild offline.
-- ============================================================================

-- Partial index trên item.category (tiết kiệm dung lượng: nhiều NULL).
CREATE INDEX IF NOT EXISTS item_category_idx
  ON app.item (category)
  WHERE category IS NOT NULL;

COMMENT ON INDEX app.item_category_idx IS
  'V1.9 P6: tăng tốc DISTINCT category + filter WHERE category = $1.';

-- Index phụ trợ cho list aggregate (đã có inventory_txn_item_idx ON (item_id, occurred_at)
-- nhưng aggregation thuần theo item_id cần covering index đơn giản hơn để planner chọn).
CREATE INDEX IF NOT EXISTS inventory_txn_item_only_idx
  ON app.inventory_txn (item_id)
  INCLUDE (tx_type, qty, lot_serial_id);

COMMENT ON INDEX app.inventory_txn_item_only_idx IS
  'V1.9 P6: covering index cho aggregate totalQty per-item (items list join).';

-- Index inventory_lot_serial(item_id, status) để reservation + available filter
CREATE INDEX IF NOT EXISTS inventory_lot_serial_item_status_idx
  ON app.inventory_lot_serial (item_id, status);

COMMENT ON INDEX app.inventory_lot_serial_item_status_idx IS
  'V1.9 P6: tốc độ lookup available/hold lot per item (items list tồn kho).';
