-- V4.1 Đợt 4 — Liên kết Lệnh sản xuất ↔ BOM (SX-16 / SX-17).
--
-- Bối cảnh (plans/v4.1-audit-hoan-thien/AUDIT.md §3, DOT4_PLAN.md):
--   Tab BOM "Lệnh SX / Sản xuất" lọc WO qua sales_order.bom_template_id → WO
--   tạo từ CHÍNH BOM (nút GTAM trên dòng BOM, phiếu LSX mở từ BOM) không bao
--   giờ hiện, và sau khi ẩn Đơn hàng bán (Q4) thì không còn WO nào hiện.
--   `bom_line.metadata.routing.linkedWorkOrderId` (đường link cũ) không ai ghi.
--
-- Thêm 2 cột trên work_order (FK ON DELETE SET NULL — xoá dòng/BOM không
-- xoá lệnh) + backfill từ 3 nguồn:
--   1. bom_line.metadata.routing.linkedWorkOrderId (nếu có ai ghi tay)
--   2. audit_event CREATE work_order có after_json.bomLineId (route from-bom-line
--      ghi từ V3.7.43)
--   3. sales_order.bom_template_id (WO kiểu cũ từ đơn hàng)
--
-- Idempotent. User: hethong_app. Bọc BEGIN/COMMIT. Apply TRƯỚC khi deploy code Đợt 4.

BEGIN;

SET search_path TO app, public;

ALTER TABLE app.work_order ADD COLUMN IF NOT EXISTS bom_template_id UUID;
ALTER TABLE app.work_order ADD COLUMN IF NOT EXISTS bom_line_id UUID;

DO $$ BEGIN
  ALTER TABLE app.work_order ADD CONSTRAINT work_order_bom_template_fk
    FOREIGN KEY (bom_template_id) REFERENCES app.bom_template(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE app.work_order ADD CONSTRAINT work_order_bom_line_fk
    FOREIGN KEY (bom_line_id) REFERENCES app.bom_line(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS work_order_bom_template_idx
  ON app.work_order (bom_template_id) WHERE bom_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS work_order_bom_line_idx
  ON app.work_order (bom_line_id) WHERE bom_line_id IS NOT NULL;

COMMENT ON COLUMN app.work_order.bom_template_id IS
  'V4.1 Đợt 4 (SX-16) — BOM nguồn của lệnh SX (tạo từ dòng BOM / LSX mở từ BOM / đơn hàng gắn BOM). NULL = lệnh độc lập.';
COMMENT ON COLUMN app.work_order.bom_line_id IS
  'V4.1 Đợt 4 (SX-17) — Dòng BOM (linh kiện gia công) sinh ra lệnh SX. NULL nếu lệnh không từ 1 dòng cụ thể.';

-- ── Backfill 1: metadata.routing.linkedWorkOrderId ─────────────────────
UPDATE app.work_order wo
SET bom_line_id = bl.id,
    bom_template_id = bl.template_id
FROM app.bom_line bl
WHERE (bl.metadata #>> '{routing,linkedWorkOrderId}') = wo.id::text
  AND wo.bom_line_id IS NULL;

-- ── Backfill 2: audit CREATE (from-bom-line ghi after_json.bomLineId) ──
UPDATE app.work_order wo
SET bom_line_id = src.line_id,
    bom_template_id = src.template_id
FROM (
  SELECT DISTINCT ON (ae.object_id)
         ae.object_id AS wo_id, bl.id AS line_id, bl.template_id
  FROM app.audit_event ae
  JOIN app.bom_line bl ON bl.id::text = (ae.after_json ->> 'bomLineId')
  WHERE ae.object_type = 'work_order'
    AND ae.action = 'CREATE'
    AND ae.object_id IS NOT NULL
    AND (ae.after_json ->> 'bomLineId') ~* '^[0-9a-f-]{36}$'
  ORDER BY ae.object_id, ae.occurred_at
) src
WHERE src.wo_id = wo.id
  AND wo.bom_line_id IS NULL;

-- ── Backfill 3: WO kiểu cũ gắn đơn hàng có BOM ─────────────────────────
UPDATE app.work_order wo
SET bom_template_id = so.bom_template_id
FROM app.sales_order so
WHERE so.id = wo.linked_order_id
  AND so.bom_template_id IS NOT NULL
  AND wo.bom_template_id IS NULL;

COMMIT;
