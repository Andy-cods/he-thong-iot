-- Dự trù thu — bảng khoản thu dự kiến nhập tay (KHÔNG gắn hoá đơn bán), đối
-- xứng với 0077_fin_planned_expense.sql. Khách hàng của HĐ bán (direction=OUT)
-- đang lưu ở fin_invoice.supplier_id (danh bạ đối tác dùng chung app.supplier,
-- xem getReceivablesByCustomer) → customer_id FK về app.supplier.
--
-- Trạng thái dùng VARCHAR + CHECK (không pgEnum) — theo quy ước 0057/0068/0077.
-- Idempotent (IF NOT EXISTS). User: hethong_app (staging: staging_app — role
-- cần quyền CREATE trên schema app).

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.fin_planned_income (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description   VARCHAR(500) NOT NULL,
  amount        NUMERIC(18,2) NOT NULL,
  due_date      DATE NOT NULL,
  category_id   UUID REFERENCES app.fin_category(id),
  customer_id   UUID REFERENCES app.supplier(id),
  account_id    UUID REFERENCES app.fin_account(id),
  status        VARCHAR(16) NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','DONE','CANCELLED')),
  notes         TEXT,
  created_by    UUID REFERENCES app.user_account(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_planned_income_status_idx
  ON app.fin_planned_income (status);
CREATE INDEX IF NOT EXISTS fin_planned_income_due_date_idx
  ON app.fin_planned_income (due_date);

COMMENT ON TABLE app.fin_planned_income IS
  'Khoản thu dự kiến (nhập tay, chưa có hoá đơn bán) cho ô "Dự trù thu" Tổng quan Tài chính.';
