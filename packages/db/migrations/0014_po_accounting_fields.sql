-- ============================================================================
-- V1.9 Phase 9 — PO accounting + approval workflow.
-- ----------------------------------------------------------------------------
-- Thêm các cột cần thiết cho form PO hoàn chỉnh & export kế toán:
--
--   purchase_order.metadata          (jsonb)    -- lưu approvalStatus,
--                                                  approvedBy, rejectedReason…
--   purchase_order.payment_terms     (varchar)  -- auto-fill từ supplier, editable.
--   purchase_order.delivery_address  (text)     -- địa chỉ giao hàng cho PO này.
--   purchase_order.actual_delivery_date (date)  -- ngày thực tế nhận đủ.
--   purchase_order_line.tax_rate     (numeric)  -- % VAT per line (default 8).
--   purchase_order_line.line_total   (numeric)  -- snapshot qty*price*(1+tax)
--                                                  (có thể recompute; cache để
--                                                   export nhanh).
--
-- Idempotent: IF NOT EXISTS trên mọi ADD COLUMN.
-- ============================================================================

SET search_path TO app, public;

ALTER TABLE app.purchase_order
  ADD COLUMN IF NOT EXISTS metadata          jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms     varchar(100),
  ADD COLUMN IF NOT EXISTS delivery_address  text,
  ADD COLUMN IF NOT EXISTS actual_delivery_date date;

ALTER TABLE app.purchase_order_line
  ADD COLUMN IF NOT EXISTS tax_rate   numeric(5,2)  NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS line_total numeric(18,2) NOT NULL DEFAULT 0;

-- Index approvalStatus (JSONB text extract) — dùng cho filter list.
CREATE INDEX IF NOT EXISTS purchase_order_approval_status_idx
  ON app.purchase_order ((metadata ->> 'approvalStatus'));
