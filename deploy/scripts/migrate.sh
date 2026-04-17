#!/usr/bin/env bash
# =============================================================
# Migrate DB schema cho he-thong-iot
# Chạy trên VPS sau khi pull image mới, trước khi `docker compose up -d`.
# Dùng drizzle-kit push (V1) — V2 chuyển sang migrate có file SQL.
# =============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL chưa set — export trước khi chạy}"

echo "[migrate] Target: ${DATABASE_URL%%@*}@***"

# Chạy drizzle-kit push qua image app (đã có pnpm + drizzle-kit)
docker run --rm \
	--network iot_net \
	--add-host=host.docker.internal:host-gateway \
	-e DATABASE_URL="$DATABASE_URL" \
	"${IOT_IMAGE:-registry.local/hethong-iot:latest}" \
	sh -c "cd packages/db && pnpm exec drizzle-kit push"

echo "[migrate] Done. Run seed nếu là DB mới: docker run ... pnpm db:seed"
