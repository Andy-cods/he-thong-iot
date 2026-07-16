-- V3.12 — persist mức ưu tiên đã có trên form/API của Sales Order.
-- Backward-compatible và idempotent để có thể apply trước khi deploy code.

ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE app.sales_order
  DROP CONSTRAINT IF EXISTS sales_order_priority_check;

ALTER TABLE app.sales_order
  ADD CONSTRAINT sales_order_priority_check
  CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
