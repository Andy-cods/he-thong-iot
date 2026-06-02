-- V3.7.69 — Mở rộng Purchase Request thành phiếu YCVT (Yêu cầu Vật tư) đầy đủ.
--
-- Nguồn yêu cầu: file Excel "YCVT Z0000002-262422.xlsx" — template "Phiếu MRF".
-- Bổ sung trên migration 0043:
--   1. Số phiếu giấy `paper_form_no` format `{seq}/PRD-MRF/{MMYY}` (auto-gen).
--   2. Workflow phê duyệt 3 bước: SUBMITTED → DEPT_APPROVED → DIRECTOR_APPROVED.
--   3. Tracking 4 cột mốc: dept_approved, director_approved, po_created, completed.
--   4. Line: on_hand_snapshot (tồn kho lúc tạo) + line_total (qty × giá DK).
--
-- KHÔNG đổi enum `purchase_request_status` hiện có (DRAFT/SUBMITTED/APPROVED/
-- CONVERTED/REJECTED) — `approval_step` thêm layer mềm bên cạnh `status` để
-- map vào 3 bước duyệt cụ thể của form YCVT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Số phiếu giấy + workflow phê duyệt (header)
-- ----------------------------------------------------------------------------
ALTER TABLE app.purchase_request
  ADD COLUMN IF NOT EXISTS paper_form_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS approval_step VARCHAR(24) NOT NULL DEFAULT 'DRAFT',

  -- Step 2: Trưởng bộ phận
  ADD COLUMN IF NOT EXISTS dept_approved_by  UUID REFERENCES app.user_account(id),
  ADD COLUMN IF NOT EXISTS dept_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dept_approval_note TEXT,

  -- Step 3: Giám đốc / Mua hàng
  ADD COLUMN IF NOT EXISTS director_approved_by  UUID REFERENCES app.user_account(id),
  ADD COLUMN IF NOT EXISTS director_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS director_approval_note TEXT,

  -- Tracking section IV (timeline)
  ADD COLUMN IF NOT EXISTS po_created_at      TIMESTAMPTZ,   -- "Đã tạo đơn mua PR/PO"
  ADD COLUMN IF NOT EXISTS goods_received_at  TIMESTAMPTZ,   -- "Đã nhận hàng"
  ADD COLUMN IF NOT EXISTS goods_issued_at    TIMESTAMPTZ,   -- "Đã xuất kho"
  ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ,   -- "Hoàn tất"

  -- Reject path (có thể reject ở bất kỳ bước nào)
  ADD COLUMN IF NOT EXISTS rejected_by     UUID REFERENCES app.user_account(id),
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,

  -- Tổng tiền dự kiến cache (sum line_total)
  ADD COLUMN IF NOT EXISTS total_estimated_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN app.purchase_request.paper_form_no IS
  'YCVT — Số phiếu giấy format {seq}/PRD-MRF/{MMYY} (VD 52/PRD-MRF/0526). Auto-gen khi submit.';
COMMENT ON COLUMN app.purchase_request.approval_step IS
  'YCVT 3-step workflow: DRAFT → SUBMITTED → DEPT_APPROVED → DIRECTOR_APPROVED → CONVERTED → DONE. REJECTED có thể từ bất kỳ bước.';
COMMENT ON COLUMN app.purchase_request.total_estimated_amount IS
  'Cache sum(line.line_total) — auto-calc khi insert/update line.';

-- Constraint check approval_step values
ALTER TABLE app.purchase_request
  DROP CONSTRAINT IF EXISTS pr_approval_step_chk;
ALTER TABLE app.purchase_request
  ADD CONSTRAINT pr_approval_step_chk CHECK (
    approval_step IN (
      'DRAFT',
      'SUBMITTED',
      'DEPT_APPROVED',
      'DIRECTOR_APPROVED',
      'CONVERTED',
      'DONE',
      'REJECTED'
    )
  );

-- Unique paper_form_no (cho phép NULL khi DRAFT)
CREATE UNIQUE INDEX IF NOT EXISTS pr_paper_form_no_uk
  ON app.purchase_request(paper_form_no)
  WHERE paper_form_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS pr_approval_step_idx
  ON app.purchase_request(approval_step, created_at);

-- ----------------------------------------------------------------------------
-- 2. Line: on_hand_snapshot + line_total
-- ----------------------------------------------------------------------------
ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS on_hand_snapshot NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS line_total       NUMERIC(18,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN app.purchase_request_line.on_hand_snapshot IS
  'YCVT — Tồn kho lúc tạo phiếu (auto-fill từ inventory_balance). Read-only sau khi tạo.';
COMMENT ON COLUMN app.purchase_request_line.line_total IS
  'YCVT — Tổng tiền dòng = qty × estimated_unit_price (auto-calc).';

-- Trigger: auto-update line_total + total_estimated_amount
CREATE OR REPLACE FUNCTION app.pr_line_calc_total() RETURNS TRIGGER AS $$
BEGIN
  NEW.line_total := COALESCE(NEW.qty * NEW.estimated_unit_price, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pr_line_calc_total_trg ON app.purchase_request_line;
CREATE TRIGGER pr_line_calc_total_trg
  BEFORE INSERT OR UPDATE OF qty, estimated_unit_price
  ON app.purchase_request_line
  FOR EACH ROW
  EXECUTE FUNCTION app.pr_line_calc_total();

CREATE OR REPLACE FUNCTION app.pr_sync_total() RETURNS TRIGGER AS $$
DECLARE
  v_pr_id UUID;
  v_total NUMERIC(18,2);
BEGIN
  v_pr_id := COALESCE(NEW.pr_id, OLD.pr_id);
  SELECT COALESCE(SUM(line_total), 0) INTO v_total
    FROM app.purchase_request_line WHERE pr_id = v_pr_id;
  UPDATE app.purchase_request SET total_estimated_amount = v_total
    WHERE id = v_pr_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pr_sync_total_trg ON app.purchase_request_line;
CREATE TRIGGER pr_sync_total_trg
  AFTER INSERT OR UPDATE OR DELETE
  ON app.purchase_request_line
  FOR EACH ROW
  EXECUTE FUNCTION app.pr_sync_total();

-- Backfill line_total cho rows hiện có
UPDATE app.purchase_request_line
SET line_total = COALESCE(qty * estimated_unit_price, 0)
WHERE line_total = 0 AND estimated_unit_price IS NOT NULL;

UPDATE app.purchase_request pr
SET total_estimated_amount = COALESCE((
  SELECT SUM(line_total) FROM app.purchase_request_line WHERE pr_id = pr.id
), 0);

-- ----------------------------------------------------------------------------
-- 3. Generator số phiếu giấy YCVT format `{seq}/PRD-MRF/{MMYY}`
--    - seq reset mỗi tháng, count theo dept (proposingDepartment) hoặc global?
--    - Theo Excel mẫu: 52/PRD-MRF/0526 — đây là sequence GLOBAL per month.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.gen_pr_paper_form_no()
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_mmyy TEXT;
  v_next_seq INT;
BEGIN
  v_mmyy := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MMYY');

  -- Đếm số phiếu đã có trong tháng + năm hiện tại (paper_form_no LIKE '%/PRD-MRF/MMYY')
  -- + 1 để ra seq mới. Atomic vì wrap trong SERIALIZABLE transaction sẽ gặp ít lock.
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(paper_form_no, '/', 1) AS INT)
  ), 0) + 1
  INTO v_next_seq
  FROM app.purchase_request
  WHERE paper_form_no LIKE '%/PRD-MRF/' || v_mmyy
    AND paper_form_no ~ '^[0-9]+/PRD-MRF/[0-9]{4}$';  -- guard malformed

  RETURN v_next_seq::TEXT || '/PRD-MRF/' || v_mmyy;
END;
$$;

COMMENT ON FUNCTION app.gen_pr_paper_form_no() IS
  'YCVT — Sinh số phiếu giấy format {seq}/PRD-MRF/{MMYY}. Seq reset mỗi tháng (theo Excel mẫu).';

