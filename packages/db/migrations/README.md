# Migrations SQL thủ công

Drizzle-kit `push` chỉ diff schema ORM vs DB — **không** đọc file `.sql`.
Các migration có logic đặc biệt (CREATE EXTENSION, ALTER TYPE, index custom)
phải apply thủ công qua `psql` bằng script
[`deploy/scripts/apply-sql-migrations.sh`](../../../deploy/scripts/apply-sql-migrations.sh).

## Quy ước đặt tên

| Suffix / prefix       | User chạy        | Lý do                                        |
| --------------------- | ---------------- | -------------------------------------------- |
| `0002a_*`, `*_superuser*` | `postgres`   | Cần quyền superuser (CREATE EXTENSION ...)   |
| còn lại               | `hethong_app`    | Owner DB, quyền đủ cho ALTER TABLE / INDEX   |

## Danh sách migrations

| File                          | User         | Mô tả                                                        |
| ----------------------------- | ------------ | ------------------------------------------------------------ |
| `0002a_extensions.sql`        | `postgres`   | `CREATE EXTENSION pg_trgm, unaccent`                         |
| `0002b_item_master.sql`       | `hethong_app`| Item master, barcode, supplier, import_batch + trgm indexes  |
| `0002c_gin_unaccent_fix.sql`  | `postgres`   | `public.f_unaccent` IMMUTABLE wrapper + recreate GIN idx     |
| `0003a_bom_enums.sql`         | `postgres`   | Enum `app.bom_status` + grant usage (V1.1-alpha)             |
| `0003b_bom_tables.sql`        | `hethong_app`| `bom_template`, `bom_line` (self-ref tree), `receiving_event`|
| `0003c_bom_indexes.sql`       | `hethong_app`| GIN trgm + btree + trigger updated_at (reuse `f_unaccent`)   |
| `0003d_seed_demo.sql`         | `hethong_app`| Seed 4 role + BOM demo `CNC-ABC-DEMO` (idempotent)           |
| `0017_material_process_master.sql` | `hethong_app`| **V2.0** — material_master + process_master + seed 23 vật liệu + 11 quy trình từ Excel sheet 3 |
| `0018_item_dimensions_weight.sql`  | `hethong_app`| **V2.0** — item.dimensions(jsonb) + weight_g + material_code FK material_master |
| `0019_bom_line_position_code.sql`  | `hethong_app`| **V2.0** — bom_line.position_code (R01/S40) + bom_line.notes |
| `0025_bom_sheet.sql`               | `hethong_app`| **V2.0 Sprint 6** — bom_sheet table (PROJECT/MATERIAL_REF/PROCESS_REF/CUSTOM) — 1 BOM List có nhiều sheet |
| `0026_bom_line_sheet_link.sql`     | `hethong_app`| **V2.0 Sprint 6** — bom_line.sheet_id FK + trigger enforce parent same sheet |
| `0027_bom_sheet_backfill.sql`      | `hethong_app`| **V2.0 Sprint 6** — backfill 1 sheet PROJECT cho mỗi BOM cũ + SET NOT NULL bom_line.sheet_id |
| `0028_rename_sheet_kinds.sql`      | `hethong_app`| **V2.0 Sprint 6 FIX** — ALTER TYPE rename MATERIAL_REF→MATERIAL, PROCESS_REF→PROCESS |
| `0029_bom_sheet_material_row.sql`  | `hethong_app`| **V2.0 Sprint 6 FIX** — bảng material rows per-BOM (giá deal, phôi, status 5-state) |
| `0030_bom_sheet_process_row.sql`   | `hethong_app`| **V2.0 Sprint 6 FIX** — bảng process rows per-BOM (giờ, đơn giá, trạm) |
| `0031_seed_full_master_catalog.sql`| `hethong_app`| **V2.0 Sprint 6** — seed FULL Excel sheet 3 (60 materials + 19 processes) |

### Flow apply V1.1-alpha

```bash
# Thứ tự bắt buộc
bash scripts/apply-sql-migrations.sh 0003a_bom_enums.sql postgres
bash scripts/apply-sql-migrations.sh 0003b_bom_tables.sql hethong_app
bash scripts/apply-sql-migrations.sh 0003c_bom_indexes.sql hethong_app
bash scripts/apply-sql-migrations.sh 0003d_seed_demo.sql hethong_app

# Hoặc apply toàn bộ (script tự pick user theo prefix)
bash scripts/apply-sql-migrations.sh
```

## Apply trên VPS

```bash
# SSH vào VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215

# Backup trước (BẮT BUỘC)
cd /opt/he-thong-iot/deploy
bash scripts/backup.sh

# Apply toàn bộ (theo thứ tự lexical)
bash scripts/apply-sql-migrations.sh

# Hoặc apply từng file:
bash scripts/apply-sql-migrations.sh 0002a_extensions.sql postgres
bash scripts/apply-sql-migrations.sh 0002b_item_master.sql hethong_app
```

## Verify sau khi apply

```bash
docker exec -i iot_postgres psql -U hethong_app -d hethong_iot <<'SQL'
-- Extension đã có
SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent');
-- Expect: 2 rows

-- Index đã tạo
SELECT indexname FROM pg_indexes
WHERE schemaname = 'app'
  AND indexname IN (
    'item_name_unaccent_trgm_idx',
    'item_sku_trgm_idx',
    'item_category_trgm_idx'
  );
-- Expect: 3 rows

-- Smoke search không dấu
INSERT INTO app.item (sku, name, item_type, uom_base)
VALUES ('TEST-BR-01', 'Bánh răng thử', 'PART', 'pcs')
ON CONFLICT DO NOTHING;

SELECT sku, name FROM app.item
WHERE unaccent(name) ILIKE '%' || unaccent('banh rang') || '%';
-- Expect: 1+ row chứa 'Bánh răng thử'

DELETE FROM app.item WHERE sku = 'TEST-BR-01';
SQL
```

## Rollback

Indexes và enums mới KHÔNG có migration `down` tự động. Nếu cần rollback:

```bash
# Full restore từ backup
docker exec iot_postgres pg_restore -U postgres -d hethong_iot --clean \
  /backups/<timestamp>.dump

# Hoặc drop tay từng object (khi data chưa phụ thuộc)
docker exec -i iot_postgres psql -U hethong_app -d hethong_iot <<'SQL'
DROP INDEX IF EXISTS app.item_name_unaccent_trgm_idx;
DROP INDEX IF EXISTS app.item_sku_trgm_idx;
DROP INDEX IF EXISTS app.item_category_trgm_idx;
-- (enum mới không drop được dễ dàng; tham khảo docs/context-part-2.md)
SQL
```
