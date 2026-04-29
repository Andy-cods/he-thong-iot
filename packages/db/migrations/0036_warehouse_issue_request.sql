-- V3.7.9 — Warehouse issue request (yêu cầu xuất kho cần Kho duyệt).
--
-- Workflow: bộ phận khác (operator/planner) tạo PENDING → Kho duyệt APPROVED
-- (tự động execute issue tạo OUT_ISSUE inventory_txn) hoặc REJECTED.

CREATE TABLE IF NOT EXISTS app.warehouse_issue_request (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no      VARCHAR(64) NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
  reason          VARCHAR(32) NOT NULL DEFAULT 'manual',
  reference       VARCHAR(64),
  notes           TEXT,
  /** Picks plan: [{itemId, sku, picks:[{lotSerialId, lotCode, binId, binCode, qty}]}] */
  picks_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_qty       NUMERIC(18,4) NOT NULL DEFAULT 0,
  requested_by    UUID NOT NULL REFERENCES app.user_account(id),
  approved_by     UUID REFERENCES app.user_account(id),
  rejected_by     UUID REFERENCES app.user_account(id),
  reject_reason   TEXT,
  approved_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS issue_request_no_uk
  ON app.warehouse_issue_request (request_no);
CREATE INDEX IF NOT EXISTS issue_request_status_idx
  ON app.warehouse_issue_request (status, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_request_requester_idx
  ON app.warehouse_issue_request (requested_by, created_at DESC);

COMMENT ON TABLE app.warehouse_issue_request IS
  'V3.7.9 — Yêu cầu xuất kho cần Kho duyệt. APPROVED → tự execute OUT_ISSUE.';
