#!/bin/bash
# V3.3 — Capacity upgrade ngắn hạn cho VPS production.
# Chạy trên VPS: ssh root@45.124.94.13 'bash -s' < ops/capacity-upgrade.sh
# Hoặc paste từng phần một.

set -e
echo "════════════════════════════════════════════════════════════"
echo "  V3.3 Capacity Upgrade — Postgres tuning + Swap + Backup"
echo "════════════════════════════════════════════════════════════"

# ─── 1. POSTGRES TUNING ────────────────────────────────────────────────────
echo ""
echo "[1/4] Postgres tuning..."
docker exec iot_postgres psql -U hethong_app -d hethong_iot <<'SQL'
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '5GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
ALTER SYSTEM SET random_page_cost = 1.1;
SQL

echo "  Restarting Postgres (downtime ~5-10s)..."
docker restart iot_postgres

# Đợi healthy
echo "  Waiting for healthy..."
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' iot_postgres 2>/dev/null || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "  ✓ Postgres healthy after ${i}s"
    break
  fi
  sleep 1
done

echo "  Verifying new settings..."
docker exec iot_postgres psql -U hethong_app -d hethong_iot -t -c \
  "SHOW max_connections; SHOW shared_buffers; SHOW effective_cache_size; SHOW work_mem;"

# ─── 2. SWAP 4GB ───────────────────────────────────────────────────────────
echo ""
echo "[2/4] Setup swap 4GB..."
if [ -f /swapfile ]; then
  echo "  /swapfile đã tồn tại, skip."
else
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  # Tune swappiness thấp (chỉ swap khi cần thiết)
  sysctl vm.swappiness=10
  if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
    echo "vm.swappiness=10" >> /etc/sysctl.conf
  fi
  echo "  ✓ Swap 4GB enabled, swappiness=10"
fi

free -h

# ─── 3. BACKUP CRON ────────────────────────────────────────────────────────
echo ""
echo "[3/4] Setup pg_dump daily backup..."
mkdir -p /opt/hethong-iot/backups
chmod 700 /opt/hethong-iot/backups

cat > /opt/hethong-iot/backup-db.sh <<'BACKUP'
#!/bin/bash
# Daily backup pg_dump → /opt/hethong-iot/backups/
# Retention: keep last 14 days
set -e
BACKUP_DIR="/opt/hethong-iot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/hethong_iot_${DATE}.sql.gz"

docker exec iot_postgres pg_dump -U hethong_app -Fc hethong_iot | gzip > "$FILE"

# Verify file size > 1KB (sanity check)
SIZE=$(stat -c%s "$FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup] ERROR: file too small ($SIZE bytes), backup failed"
  exit 1
fi

# Cleanup old: keep last 14
find "$BACKUP_DIR" -name "hethong_iot_*.sql.gz" -mtime +14 -delete

echo "[backup] OK $(date -Iseconds) → $FILE ($(du -h "$FILE" | cut -f1))"
BACKUP

chmod +x /opt/hethong-iot/backup-db.sh

# Cron daily 03:00 AM Asia/Ho_Chi_Minh (server TZ đã là Asia/HCM)
CRON_LINE="0 3 * * * /opt/hethong-iot/backup-db.sh >> /var/log/hethong-iot-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup-db.sh"; echo "$CRON_LINE") | crontab -

echo "  ✓ Cron installed: backup daily 03:00, retention 14 days"
echo "  Run thử ngay backup..."
/opt/hethong-iot/backup-db.sh

# ─── 4. UPDATE APP POOL (optional, nếu muốn tăng pool tận dụng max_conn=100) ─
echo ""
echo "[4/4] Recommendation cho app pool:"
echo "  Hiện tại: max=15 (apps/web/src/lib/db.ts)"
echo "  Có thể tăng lên 30 sau khi PG max_connections=100."
echo "  → Sửa code + push để tận dụng. (Không tự đổi vì cần restart app.)"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✓ Capacity upgrade DONE"
echo "════════════════════════════════════════════════════════════"
free -h
echo ""
docker exec iot_postgres psql -U hethong_app -d hethong_iot -t -c \
  "SELECT 'connections active: ' || count(*)::text FROM pg_stat_activity WHERE state IS NOT NULL;"
ls -lh /opt/hethong-iot/backups/ | tail -5
