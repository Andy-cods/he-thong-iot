-- =============================================================
-- 0091_bom_qty_per_set_fix.sql  (hotfix 20/11/2026)
--   Lỗi: commit mẫu "BOM TRIỂN KHAI" ghi qty_per_parent = cột "SL" của file
--   (= Hệ số × Số bộ) thay vì "Hệ số" (SL / 1 bộ). Toàn hệ thống hiểu
--   qty_per_parent là SL cho 1 bộ → lưới hiển thị SL = qty_per_parent × target_qty
--   = SL file × số bộ (vd 618824 dòng 7: Hệ số 6, SL 24, 4 bộ → hiện 96).
--
--   Sửa (chỉ dữ liệu mẫu TRIỂN KHAI có số bộ > 1, dòng còn đúng dạng lỗi):
--     A. bom_line: qty_per_parent := coef; metadata.fileQty := SL cũ (truy vết),
--        metadata.qtyFix := '0091'; row_version + 1 (editor đang mở thấy xung đột).
--        Predicate: template.metadata.template = 'TRIEN_KHAI' AND target_qty > 1
--                   AND coef > 0 AND qty_per_parent = coef × target_qty.
--        Prod 20/11: 308 dòng = 316907(42) + 606615(54) + 618823(54) + 618824(55)
--                   + 618841(63) + 622582(40). Z0000002590422 (1 bộ) không đổi.
--     B. bom_revision.frozen_snapshot.lines[] của các BOM TRIỂN KHAI (mọi trạng
--        thái: RELEASED dùng explode đơn hàng; SUPERSEDED = lịch sử/khôi phục).
--        Dòng snapshot KHÔNG có coef → lấy Hệ số + Số bộ theo thứ tự:
--          1) import_batch.preview_json.trienKhai: rows[rowNumber = metadata.importedRow]
--             .coef + trienKhai.setCount (batch = metadata.importedFromBatch) — đúng
--             lúc chụp snapshot, kể cả dòng đã bị xoá khi "ghi đè" (622582 R01–R04);
--          2) bom_line cùng id (coef) + template.target_qty.
--        Chỉ đổi dòng có qtyPerParent = Hệ số × Số bộ và Số bộ > 1.
--
-- IDEMPOTENT: sau khi sửa qty_per_parent = coef ≠ coef × số bộ (số bộ > 1) →
-- chạy lại không đổi gì. 1 transaction. PG ≥ 13 (trim_scale).
-- KHÔNG đụng chứng từ đã tạo (PR/WO/PO/phiếu giao/...): prod 20/11 không có
-- chứng từ nào từ 6 BOM này (xem báo cáo). Smoke: 0091_bom_qty_per_set_fix_smoke.sql.
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

-- Trước khi sửa: số dòng theo BOM (mong đợi tổng 308 trên prod 20/11).
SELECT 'before' AS phase, t.code, t.target_qty, count(*) AS lines_to_fix
FROM app.bom_line l
JOIN app.bom_template t ON t.id = l.template_id
WHERE t.metadata ->> 'template' = 'TRIEN_KHAI'
  AND t.target_qty > 1
  AND l.coef > 0
  AND l.qty_per_parent = l.coef * t.target_qty
GROUP BY t.code, t.target_qty
ORDER BY t.code;

-- A. bom_line
UPDATE app.bom_line l
SET qty_per_parent = l.coef,
    metadata = COALESCE(l.metadata, '{}'::jsonb)
               || jsonb_build_object('fileQty', trim_scale(l.qty_per_parent), 'qtyFix', '0091'),
    row_version = l.row_version + 1,
    updated_at = now()
FROM app.bom_template t
WHERE t.id = l.template_id
  AND t.metadata ->> 'template' = 'TRIEN_KHAI'
  AND t.target_qty > 1
  AND l.coef > 0
  AND l.qty_per_parent = l.coef * t.target_qty;

-- B. frozen_snapshot của bom_revision
WITH src AS (
  SELECT r.id AS rev_id,
         e.ord,
         e.line,
         COALESCE(fb.coef, bl.coef) AS coef,
         CASE WHEN fb.coef IS NOT NULL THEN fb.sets ELSE t.target_qty END AS sets
  FROM app.bom_revision r
  JOIN app.bom_template t ON t.id = r.template_id
  CROSS JOIN LATERAL jsonb_array_elements(r.frozen_snapshot -> 'lines') WITH ORDINALITY AS e(line, ord)
  LEFT JOIN LATERAL (
    SELECT NULLIF(pr ->> 'coef', '')::numeric AS coef,
           COALESCE(NULLIF(b.preview_json -> 'trienKhai' ->> 'setCount', '')::numeric, 1) AS sets
    FROM app.import_batch b
    CROSS JOIN LATERAL jsonb_array_elements(b.preview_json -> 'trienKhai' -> 'rows') AS pr
    WHERE b.id::text = e.line -> 'metadata' ->> 'importedFromBatch'
      AND pr ->> 'rowNumber' = e.line -> 'metadata' ->> 'importedRow'
    LIMIT 1
  ) fb ON true
  LEFT JOIN app.bom_line bl ON bl.id::text = e.line ->> 'id'
  WHERE t.metadata ->> 'template' = 'TRIEN_KHAI'
    AND jsonb_typeof(r.frozen_snapshot -> 'lines') = 'array'
),
flag AS (
  SELECT src.*,
         (coef > 0 AND sets > 1
          AND (line ->> 'qtyPerParent') ~ '^[0-9]+(\.[0-9]+)?$'
          AND (line ->> 'qtyPerParent')::numeric = coef * sets) AS fix
  FROM src
),
agg AS (
  SELECT rev_id,
         jsonb_agg(
           CASE WHEN fix THEN
             line
             || jsonb_build_object('qtyPerParent', coef::numeric(18, 6)::text)
             || jsonb_build_object('metadata',
                  COALESCE(line -> 'metadata', '{}'::jsonb)
                  || jsonb_build_object('fileQty', trim_scale((line ->> 'qtyPerParent')::numeric),
                                        'qtyFix', '0091'))
           ELSE line END
           ORDER BY ord
         ) AS new_lines,
         count(*) FILTER (WHERE fix) AS n_fix
  FROM flag
  GROUP BY rev_id
)
UPDATE app.bom_revision r
SET frozen_snapshot = jsonb_set(r.frozen_snapshot, '{lines}', agg.new_lines)
FROM agg
WHERE agg.rev_id = r.id
  AND agg.n_fix > 0;

-- Kiểm: mọi BOM TRIỂN KHAI không còn dòng dạng lỗi (remaining_bad = 0 cả 2 cột);
-- fixed_* = số dòng mang dấu qtyFix 0091.
SELECT 'after' AS phase, t.code, t.status, t.target_qty,
       count(l.id) AS lines,
       count(l.id) FILTER (WHERE t.target_qty > 1 AND l.coef > 0
                           AND l.qty_per_parent = l.coef * t.target_qty) AS remaining_bad,
       count(l.id) FILTER (WHERE l.metadata ->> 'qtyFix' = '0091') AS fixed_lines,
       (SELECT count(*)
          FROM app.bom_revision r, jsonb_array_elements(r.frozen_snapshot -> 'lines') e
         WHERE r.template_id = t.id AND e.value -> 'metadata' ->> 'qtyFix' = '0091') AS fixed_snapshot_lines
FROM app.bom_template t
LEFT JOIN app.bom_line l ON l.template_id = t.id
WHERE t.metadata ->> 'template' = 'TRIEN_KHAI'
GROUP BY t.id, t.code, t.status, t.target_qty
ORDER BY t.code;

COMMIT;
