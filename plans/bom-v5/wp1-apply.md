# WP1 — Áp migration 0083–0086

Tất cả idempotent, mỗi file bọc BEGIN/COMMIT. Chạy bằng role owner (prod `hethong_app`, staging `staging_app`). Thứ tự: staging, bản sao prod, rồi prod. Áp migration TRƯỚC khi deploy code mới. Chạy ngoài giờ vì ALTER `bom_line` khoá ngắn.

## Thứ tự
1. `0083_bom_v5_core.sql` — cột mới `bom_line`, `supplier.needs_review`, `bom_line_change`, `bom_asset`.
2. `0084_bom_supplier_backfill.sql` — backfill `supplier_id` / `supplier_pending` / `category` (chạy lại được).
3. `0085_bom_stage_ledger.sql` — `bom_stage_move` + trigger append-only.
4. `0086_delivery_slip.sql` — `delivery_slip`, `delivery_slip_line`, `delivery_slip_seq`.

```
psql -v ON_ERROR_STOP=1 -1 -f 0083_bom_v5_core.sql   # lặp cho 0084..0086; chạy mỗi file 2 lần để kiểm idempotent
```
Role `hethong_app_rw` (nếu có) được GRANT trong DO-block; nếu role tạo sau thì cấp lại: `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO hethong_app_rw; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA app TO hethong_app_rw;` (riêng `bom_stage_move` chỉ SELECT,INSERT).

## Kiểm tra TRƯỚC 0084 (ghi lại số)
```sql
SELECT count(*) AS tong_dong,
       count(*) FILTER (WHERE supplier_item_code IS NOT NULL AND btrim(supplier_item_code)<>'') AS co_ncc_text,
       count(*) FILTER (WHERE metadata->>'supplierId' IS NOT NULL OR metadata#>>'{sourcing,supplierId}' IS NOT NULL) AS co_ncc_metadata,
       count(*) FILTER (WHERE supplier_item_code LIKE '%/%') AS ten_co_gach_cheo,
       count(*) FILTER (WHERE metadata->>'category' IS NOT NULL) AS co_category
FROM app.bom_line;   -- trước 0083 thì cột mới chưa có: query này chỉ dùng cột cũ
SELECT metadata->>'category' AS cat, count(*) FROM app.bom_line GROUP BY 1 ORDER BY 2 DESC;  -- xem giá trị thật để chắc map đúng
```

## Kiểm tra SAU
```sql
SELECT count(*) FILTER (WHERE supplier_id IS NOT NULL)      AS co_supplier_id,
       count(*) FILTER (WHERE supplier_pending IS NOT NULL) AS cho_chot,
       count(*) FILTER (WHERE supplier_id IS NULL AND supplier_pending IS NULL
                          AND supplier_item_code IS NOT NULL AND btrim(supplier_item_code)<>'') AS sot_phai_bang_0,
       count(*) FILTER (WHERE category IS NOT NULL)         AS co_category,
       count(*) FILTER (WHERE metadata->>'category' IS NOT NULL AND category IS NULL) AS category_khong_nhan_ra
FROM app.bom_line;
-- co_supplier_id + cho_chot = co_ncc_text (xấp xỉ; dòng chỉ có metadata.supplierId cũng vào co_supplier_id)
SELECT bl.supplier_item_code, s.name FROM app.bom_line bl JOIN app.supplier s ON s.id=bl.supplier_id
 WHERE bl.supplier_item_code IS NOT NULL LIMIT 30;   -- soát mắt: tên text khớp tên NCC
-- Trigger append-only (trong transaction rồi rollback):
BEGIN; INSERT INTO app.bom_stage_move(line_id,to_stage,qty,doc_type) SELECT id,'X',1,'MANUAL' FROM app.bom_line LIMIT 1;
UPDATE app.bom_stage_move SET qty=2;  -- phải lỗi restrict_violation
ROLLBACK;
SELECT to_regclass('app.bom_asset'), to_regclass('app.bom_line_change'), to_regclass('app.bom_stage_move'),
       to_regclass('app.delivery_slip'), to_regclass('app.delivery_slip_line'), to_regclass('app.delivery_slip_seq');
```

## Rollback
- Chỉ backfill (0084): `UPDATE app.bom_line SET supplier_id=NULL, supplier_pending=NULL, category=NULL;` (cột cũ + metadata còn nguyên nên không mất dữ liệu; nếu 0084 chạy sau khi người dùng đã sửa NCC bằng UI V5 thì KHÔNG chạy lệnh này).
- Toàn bộ (chỉ khi chưa có dữ liệu nghiệp vụ mới và code V5 chưa deploy):
```sql
BEGIN;
DROP TABLE IF EXISTS app.delivery_slip_line, app.delivery_slip, app.delivery_slip_seq;
DROP TRIGGER IF EXISTS bom_stage_move_no_mutate ON app.bom_stage_move;
DROP TABLE IF EXISTS app.bom_stage_move;
DROP FUNCTION IF EXISTS app.bom_stage_move_immutable();
DROP TABLE IF EXISTS app.bom_line_change, app.bom_asset;
ALTER TABLE app.supplier DROP COLUMN IF EXISTS needs_review;
ALTER TABLE app.bom_line
  DROP COLUMN IF EXISTS supplier_id, DROP COLUMN IF EXISTS supplier_pending, DROP COLUMN IF EXISTS row_version,
  DROP COLUMN IF EXISTS category, DROP COLUMN IF EXISTS process_method, DROP COLUMN IF EXISTS surface_treatment,
  DROP COLUMN IF EXISTS blank_spec, DROP COLUMN IF EXISTS material_code, DROP COLUMN IF EXISTS file3d_name,
  DROP COLUMN IF EXISTS image_asset_id, DROP COLUMN IF EXISTS coef, DROP COLUMN IF EXISTS pic_names;
COMMIT;
```
- Code cũ không đọc cột mới nên áp migration rồi rollback code vẫn an toàn.

## Lưu ý
- Số phiếu: app tính `day` (Asia/Ho_Chi_Minh), `INSERT INTO app.delivery_slip_seq(day,last) VALUES ($1,1) ON CONFLICT (day) DO UPDATE SET last=delivery_slip_seq.last+1 RETURNING last` rồi `GT-PG{yymmdd}-0{last}`.
- `bom_stage_move.line_id` FK không CASCADE và trigger chặn DELETE: xoá `bom_line` đã có move sẽ lỗi (chủ ý; import retry chỉ xoá dòng chưa có move).
- Unique idempotent `bom_stage_move_doc_uk` là partial index (biểu thức): upsert từ app phải dùng `ON CONFLICT DO NOTHING` không chỉ định target, hoặc bắt lỗi 23505.
