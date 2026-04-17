#!/usr/bin/env bash
# =============================================================
# apply-sql-migrations.sh — apply file .sql trong packages/db/migrations/
#
# drizzle-kit push chỉ diff schema Drizzle ORM vs DB, KHÔNG đọc file .sql.
# Migration có CREATE EXTENSION hoặc logic đặc biệt -> phải apply bằng psql
# thủ công. Script này giúp apply đúng thứ tự + đúng user.
#
# Usage (trên VPS, sau khi SSH):
#   cd /opt/he-thong-iot/deploy
#   bash scripts/apply-sql-migrations.sh
#
# Hoặc apply từng file:
#   bash scripts/apply-sql-migrations.sh 0002a_extensions.sql postgres
#   bash scripts/apply-sql-migrations.sh 0002b_item_master.sql hethong_app
#
# Quy ước: file có suffix `_superuser` hoặc prefix `0002a` (extensions)
# sẽ chạy bằng `postgres`; các file còn lại chạy bằng `hethong_app`.
# =============================================================
set -euo pipefail

CONTAINER="${PG_CONTAINER:-iot_postgres}"
DB="${PG_DB:-hethong_iot}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/../../packages/db/migrations" && pwd)}"

apply_one() {
  local file="$1"
  local user="$2"
  local basename
  basename="$(basename "$file")"

  echo "[migrate] Apply $basename as user=$user"
  docker cp "$file" "$CONTAINER:/tmp/$basename"
  docker exec -i "$CONTAINER" psql \
    -U "$user" \
    -d "$DB" \
    -v ON_ERROR_STOP=1 \
    -f "/tmp/$basename"
  echo "[migrate] OK: $basename"
}

pick_user() {
  local name="$1"
  case "$name" in
    *_superuser*|0002a_*|0002a.sql) echo "postgres" ;;
    *) echo "hethong_app" ;;
  esac
}

if [[ $# -eq 2 ]]; then
  # Apply 1 file cụ thể
  apply_one "$MIGRATIONS_DIR/$1" "$2"
  exit 0
fi

if [[ $# -eq 1 ]]; then
  apply_one "$MIGRATIONS_DIR/$1" "$(pick_user "$1")"
  exit 0
fi

# Apply theo thứ tự lexical toàn bộ .sql files
echo "[migrate] Applying all .sql in $MIGRATIONS_DIR (lexical order)"
shopt -s nullglob
for f in "$MIGRATIONS_DIR"/*.sql; do
  user="$(pick_user "$(basename "$f")")"
  apply_one "$f" "$user"
done

echo "[migrate] All migrations applied."
