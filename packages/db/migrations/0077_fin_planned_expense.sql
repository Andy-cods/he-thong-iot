-- TASK-20261001 — "Dự trù chi" Tổng quan Tài chính, việc 3: bảng khoản chi dự
-- kiến nhập tay (KHÔNG gắn hoá đơn — khác PO chưa HĐ/HĐ mua đã xác nhận).
--
-- Trạng thái dùng VARCHAR + CHECK (không pgEnum) — theo đúng quy ước đã chốt
-- ở 0057_delivery_note.sql/0068_stocktake.sql (tránh ALTER TYPE khi mở rộng,
-- tránh lặp sự cố drift enum app.* vs public.* — packages/db/DRIFT-NOTES.md
-- mục 1). Idempotent (IF NOT EXISTS). User: hethong_app (staging: staging_app
-- — role cần quyền CREATE trên schema app).

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.fin_planned_expense (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description   VARCHAR(500) NOT NULL,
  amount        NUMERIC(18,2) NOT NULL,
  due_date      DATE NOT NULL,
  category_id   UUID REFERENCES app.fin_category(id),
  supplier_id   UUID REFERENCES app.supplier(id),
  account_id    UUID REFERENCES app.fin_account(id),
  status        VARCHAR(16) NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','DONE','CANCELLED')),
  notes         TEXT,
  created_by    UUID REFERENCES app.user_account(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_planned_expense_status_idx
  ON app.fin_planned_expense (status);
CREATE INDEX IF NOT EXISTS fin_planned_expense_due_date_idx
  ON app.fin_planned_expense (due_date);

COMMENT ON TABLE app.fin_planned_expense IS
  'TASK-20261001 — Khoản chi dự kiến (nhập tay, chưa có hoá đơn) cho ô "Dự trù chi" Tổng quan Tài chính.';
