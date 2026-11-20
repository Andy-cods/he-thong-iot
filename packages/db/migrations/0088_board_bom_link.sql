-- =============================================================
-- 0088_board_bom_link.sql
--   1. import_duplicate_mode += 'replace' (ghi đè BOM khi nhập lại file)
--                             + 'new_code' (tạo BOM mới mã khác)
--   2. production_board_item.bom_template_id (FK bom_template, ON DELETE SET NULL)
--      — dòng Bảng sản xuất tự tạo khi BOM được kích hoạt.
--   3. Backfill CHỈ 3 BOM đang dùng Z0000002-618823 / 618824 / 618841:
--      đã có dòng chưa giao cùng mã → chỉ gắn liên kết; chưa có → tạo QUEUED.
-- IDEMPOTENT (chạy lại không nhân đôi). PG ≥ 12 (ADD VALUE trong transaction,
-- giá trị mới KHÔNG được dùng trong cùng transaction này).
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

ALTER TYPE app.import_duplicate_mode ADD VALUE IF NOT EXISTS 'replace';
ALTER TYPE app.import_duplicate_mode ADD VALUE IF NOT EXISTS 'new_code';

ALTER TABLE app.production_board_item
  ADD COLUMN IF NOT EXISTS bom_template_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_board_item_bom_template_fk'
      AND conrelid = 'app.production_board_item'::regclass
  ) THEN
    ALTER TABLE app.production_board_item
      ADD CONSTRAINT production_board_item_bom_template_fk
      FOREIGN KEY (bom_template_id) REFERENCES app.bom_template(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS production_board_bom_template_idx
  ON app.production_board_item (bom_template_id)
  WHERE bom_template_id IS NOT NULL;

COMMENT ON COLUMN app.production_board_item.bom_template_id IS
  'BOM nguồn — tự gắn khi BOM chuyển Đang dùng (ACTIVE). NULL = nhập tay / BOM đã xoá.';

-- ---------- Backfill 3 BOM (mã chuẩn hoá = phần Z0000002-<số>) ----------
CREATE TEMP TABLE _bf_src ON COMMIT DROP AS
SELECT DISTINCT ON (norm)
  t.id,
  t.code,
  norm,
  COALESCE(
    NULLIF(btrim(regexp_replace(
      regexp_replace(t.name, '^\s*BOM\s+TRI(Ể|ể|E|e)N\s+KHAI\s*[—–:·|-]*\s*', '', 'i'),
      '^[A-Za-z][0-9]{6,8}-[0-9]{4,}[A-Za-z0-9_-]*\s*[—–:·|-]*\s*', '', 'i')), ''),
    t.name
  ) AS product_name,
  t.target_qty,
  CASE WHEN t.metadata ->> 'template' = 'TRIEN_KHAI' THEN 'Bộ' ELSE 'Pcs' END AS uom
FROM (
  SELECT bt.*, upper(substring(bt.code FROM '([A-Za-z][0-9]{6,8}-[0-9]{4,})')) AS norm
  FROM app.bom_template bt
  WHERE bt.status = 'ACTIVE'
) t
WHERE t.norm IN ('Z0000002-618823', 'Z0000002-618824', 'Z0000002-618841')
ORDER BY norm, t.updated_at DESC;

-- (a) Đã có dòng chưa giao cùng mã → gắn liên kết (không tạo thêm).
UPDATE app.production_board_item b
SET bom_template_id = s.id
FROM _bf_src s
WHERE b.bom_template_id IS NULL
  AND b.status <> 'DELIVERED'
  AND upper(COALESCE(substring(b.product_code FROM '([A-Za-z][0-9]{6,8}-[0-9]{4,})'), btrim(b.product_code))) = s.norm;

-- (b) Chưa có dòng chưa giao nào cùng mã → tạo QUEUED (created_by NULL).
WITH base AS (
  SELECT COALESCE(MAX(seq), 0) AS max_seq FROM app.production_board_item
),
todo AS (
  SELECT s.*, row_number() OVER (ORDER BY s.norm) AS rn
  FROM _bf_src s
  WHERE NOT EXISTS (
    SELECT 1 FROM app.production_board_item b
    WHERE b.status <> 'DELIVERED'
      AND (
        b.bom_template_id = s.id
        OR upper(COALESCE(substring(b.product_code FROM '([A-Za-z][0-9]{6,8}-[0-9]{4,})'), btrim(b.product_code))) = s.norm
      )
  )
),
ins AS (
  INSERT INTO app.production_board_item
    (seq, product_code, product_name, qty_planned, uom, status, bom_template_id)
  SELECT base.max_seq + todo.rn, todo.norm, todo.product_name,
         LEAST(COALESCE(todo.target_qty, 0), 999999999999.99)::numeric(14,2),
         todo.uom, 'QUEUED', todo.id
  FROM todo, base
  RETURNING id, product_code
)
INSERT INTO app.production_board_history (item_id, field, old_value, new_value)
SELECT ins.id, 'create', NULL, ins.product_code || ' · QUEUED (backfill 0088 từ BOM)'
FROM ins;

COMMIT;
