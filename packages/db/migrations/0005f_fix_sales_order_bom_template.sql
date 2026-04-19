-- =============================================================
-- Migration 0005f · fix sales_order missing bom_template_id
-- =============================================================
-- Drizzle schema khai báo `bom_template_id` ở order.ts nhưng V1 foundation
-- migration chỉ tạo `bom_revision_id`. Add column + FK cho khớp.
-- =============================================================

ALTER TABLE app.sales_order
  ADD COLUMN IF NOT EXISTS bom_template_id uuid REFERENCES app.bom_template(id);

CREATE INDEX IF NOT EXISTS sales_order_bom_template_idx
  ON app.sales_order (bom_template_id)
  WHERE bom_template_id IS NOT NULL;

DO $$ BEGIN
  RAISE NOTICE 'migration 0005f: sales_order.bom_template_id added';
END $$;
