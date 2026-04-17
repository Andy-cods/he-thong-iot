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
