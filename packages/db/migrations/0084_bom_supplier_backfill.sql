-- =============================================================
-- 0084_bom_supplier_backfill.sql   (BOM V5 / WP1 — backfill NCC + category)
-- IDEMPOTENT: chỉ chạm dòng chưa có supplier_id VÀ chưa có supplier_pending.
-- Phụ thuộc 0083. Chạy/rollback riêng được. KHÔNG xoá supplier_item_code / metadata.
-- Quy tắc an toàn: gán supplier_id chỉ khi khớp CHẮC CHẮN đúng 1 supplier.
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

-- 1) supplier_id từ metadata (top-level worker ghi, hoặc sourcing.supplierId) nếu là uuid hợp lệ và tồn tại
UPDATE app.bom_line bl
SET supplier_id = s.id
FROM app.supplier s
WHERE bl.supplier_id IS NULL
  AND bl.supplier_pending IS NULL
  AND s.id::text = lower(coalesce(
        NULLIF(bl.metadata->>'supplierId', ''),
        NULLIF(bl.metadata #>> '{sourcing,supplierId}', '')));

-- 2) Tên chứa "/" -> chưa chốt (không đoán, kể cả khi trùng tên supplier có "/")
UPDATE app.bom_line
SET supplier_pending = btrim(supplier_item_code)
WHERE supplier_id IS NULL
  AND supplier_pending IS NULL
  AND supplier_item_code IS NOT NULL
  AND btrim(supplier_item_code) <> ''
  AND supplier_item_code LIKE '%/%'
  AND NOT (metadata ? 'sourcing');  -- dòng sửa tay: supplier_item_code là part number, không phải tên NCC

-- 3) Khớp tên/code không phân biệt hoa thường, chỉ khi ĐÚNG 1 supplier
WITH cand AS (
  SELECT bl.id AS line_id, count(DISTINCT s.id) AS n, (array_agg(DISTINCT s.id))[1] AS sid
  FROM app.bom_line bl
  JOIN app.supplier s
    ON lower(btrim(s.name)) = lower(btrim(bl.supplier_item_code))
    OR lower(btrim(s.code)) = lower(btrim(bl.supplier_item_code))
  WHERE bl.supplier_id IS NULL
    AND bl.supplier_pending IS NULL
    AND bl.supplier_item_code IS NOT NULL
    AND btrim(bl.supplier_item_code) <> ''
  GROUP BY bl.id
)
UPDATE app.bom_line bl
SET supplier_id = cand.sid
FROM cand
WHERE cand.line_id = bl.id AND cand.n = 1;

-- 4) Còn lại có text nhưng không khớp / khớp nhiều -> pending (giữ text)
UPDATE app.bom_line
SET supplier_pending = btrim(supplier_item_code)
WHERE supplier_id IS NULL
  AND supplier_pending IS NULL
  AND supplier_item_code IS NOT NULL
  AND btrim(supplier_item_code) <> ''
  AND NOT (metadata ? 'sourcing');  -- part number, bỏ qua

-- 5) category từ metadata.category (chỉ khi nhận ra chắc chắn; còn lại NULL)
UPDATE app.bom_line
SET category = CASE
    WHEN metadata->>'category' ILIKE '%gtam%'                       THEN 'GTAM'
    WHEN metadata->>'category' ILIKE '%ngoài%'
      OR metadata->>'category' ILIKE '%ngoai%'                      THEN 'OUTSOURCED'
    WHEN metadata->>'category' ILIKE '%thương mại%'
      OR metadata->>'category' ILIKE '%thuong mai%'                 THEN 'COMMERCIAL'
  END
WHERE category IS NULL
  AND metadata->>'category' IS NOT NULL;

COMMIT;
