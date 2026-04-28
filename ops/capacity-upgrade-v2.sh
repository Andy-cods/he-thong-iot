#!/bin/bash
# V3.3 — Apply postgres tuning qua docker-compose.yml (vì command args override ALTER SYSTEM).
set -e

COMPOSE_FILE=/opt/hethong-iot/docker-compose.yml
BACKUP_FILE=/opt/hethong-iot/docker-compose.yml.bak.$(date +%Y%m%d_%H%M%S)

echo "[1/3] Backup compose file..."
cp "$COMPOSE_FILE" "$BACKUP_FILE"
echo "  → $BACKUP_FILE"

echo ""
echo "[2/3] Patch postgres command args..."
# Sed in-place: thay 3 giá trị
sed -i 's/shared_buffers=512MB/shared_buffers=2GB/' "$COMPOSE_FILE"
sed -i 's/effective_cache_size=2GB/effective_cache_size=5GB/' "$COMPOSE_FILE"
sed -i 's/max_connections=50/max_connections=100/' "$COMPOSE_FILE"

# Add random_page_cost=1.1 nếu chưa có (sau wal_buffers)
if ! grep -q "random_page_cost" "$COMPOSE_FILE"; then
  sed -i '/wal_buffers=16MB/a\      - -c\n      - random_page_cost=1.1' "$COMPOSE_FILE"
fi

echo "  Diff:"
diff "$BACKUP_FILE" "$COMPOSE_FILE" || true

echo ""
echo "[3/3] Recreate postgres container with new args..."
cd /opt/hethong-iot
docker compose up -d --force-recreate postgres

# Đợi healthy
echo "  Waiting for healthy..."
for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' iot_postgres 2>/dev/null || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "  ✓ Postgres healthy after ${i}s"
    break
  fi
  sleep 1
done

echo ""
echo "Verify:"
docker exec iot_postgres psql -U hethong_app -d hethong_iot -c \
  "SELECT name, setting, unit, source FROM pg_settings WHERE name IN ('max_connections','shared_buffers','effective_cache_size','work_mem','random_page_cost') ORDER BY name;"

echo ""
echo "✓ DONE. Rollback: cp $BACKUP_FILE $COMPOSE_FILE && docker compose up -d --force-recreate postgres"
