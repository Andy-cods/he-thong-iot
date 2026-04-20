#!/bin/bash
# docker-cleanup.sh — Manual Docker maintenance script
# Dùng khi cần dọn dẹp nhanh trước khi deploy hoặc khi disk > 70%
# Tự động chạy qua cron: Tuesday 04:00 (builder prune) + 1st/month (image prune) + Friday 04:00 (system prune)
# SAFE: không xóa named volumes (iot_pg_data, iot_redis_data, iot_caddy_data)

set -e

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Docker cleanup start"
echo "=== Disk trước ==="
df -h /

echo ""
echo "=== Docker disk usage ==="
docker system df

echo ""
echo "=== Xóa BuildKit cache (intermediate layers từ các lần build) ==="
docker builder prune -f
echo "Done builder prune"

echo ""
echo "=== Xóa image cũ hơn 30 ngày không dùng ==="
docker image prune -a --filter "until=720h" -f
echo "Done image prune"

echo ""
echo "=== Xóa dangling containers/networks ==="
docker system prune -f
echo "Done system prune"

echo ""
echo "=== Disk sau ==="
df -h /

echo ""
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Docker cleanup done"
