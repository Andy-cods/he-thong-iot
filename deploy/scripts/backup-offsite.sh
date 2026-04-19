#!/usr/bin/env bash
# =============================================================
# V1.4 Phase F — Backup off-site encrypted Cloudflare R2.
#
# Flow:
#   docker exec iot_postgres pg_dump | gzip | gpg --symmetric → upload R2
#   (rclone copy) → retention (7 daily + 4 weekly + 12 monthly).
#
# Cron (cài qua install-cron.sh):
#   0 2 * * * /opt/hethong-iot/scripts/backup-offsite.sh
#
# Exit non-zero nếu bất kỳ bước nào fail → cron sẽ log vào
# /var/log/iot-backup.log và gửi Telegram alert.
# =============================================================
set -euo pipefail

# ------ Config (override qua ENV hoặc /opt/hethong-iot/.env) -----
PG_CONTAINER="${PG_CONTAINER:-iot_postgres}"
PG_USER="${PG_USER:-hethong_app}"
PG_DB="${PG_DB:-hethong_iot}"
BACKUP_DIR="${BACKUP_DIR:-/opt/hethong-iot/backups}"
LOG_FILE="${LOG_FILE:-/var/log/iot-backup.log}"

# rclone remote (khai báo trước trong ~/.config/rclone/rclone.conf
# hoặc /root/.config/rclone/rclone.conf cho cron root).
R2_REMOTE="${R2_REMOTE:-r2:iot-backups}"

# GPG passphrase: ưu tiên file secret /run/secrets/backup_gpg_key
# (docker secret mount), fallback ENV BACKUP_GPG_PASSPHRASE.
GPG_PASS_FILE="${GPG_PASS_FILE:-/run/secrets/backup_gpg_key}"
if [[ -f "$GPG_PASS_FILE" ]]; then
	GPG_PASS=$(cat "$GPG_PASS_FILE")
elif [[ -n "${BACKUP_GPG_PASSPHRASE:-}" ]]; then
	GPG_PASS="$BACKUP_GPG_PASSPHRASE"
else
	echo "FATAL: không tìm thấy GPG passphrase (thiếu $GPG_PASS_FILE và ENV BACKUP_GPG_PASSPHRASE)" >&2
	exit 1
fi

# Telegram alert (optional)
TG_BOT="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT="${TELEGRAM_CHAT_ID:-}"

# Retention thresholds (days)
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-28}"     # 4 weeks
MONTHLY_KEEP="${MONTHLY_KEEP:-365}"  # 12 months

# ------ Helpers ------
log() {
	local msg="[backup $(date -Iseconds)] $1"
	echo "$msg"
	mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
	echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

notify() {
	local msg="$1"
	log "$msg"
	if [[ -n "$TG_BOT" && -n "$TG_CHAT" ]]; then
		curl -sS --max-time 10 \
			-d "chat_id=${TG_CHAT}" \
			-d "text=[iot backup] ${msg}" \
			"https://api.telegram.org/bot${TG_BOT}/sendMessage" > /dev/null || true
	fi
}

trap 'notify "FAIL tại dòng $LINENO (exit $?)"' ERR

# ------ Sanity checks ------
for bin in docker gpg rclone gzip; do
	command -v "$bin" >/dev/null 2>&1 || { echo "Thiếu binary: $bin" >&2; exit 2; }
done

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
DOW="$(date +%u)"     # 1..7, 7=Sunday
DOM="$(date +%d)"     # 01..31
TAG="daily"
if [[ "$DOM" == "01" ]]; then
	TAG="monthly"
elif [[ "$DOW" == "7" ]]; then
	TAG="weekly"
fi

DUMP_FILE="${BACKUP_DIR}/${PG_DB}-${TAG}-${TS}.sql.gz"
ENC_FILE="${DUMP_FILE}.gpg"

# ------ 1. pg_dump + gzip ------
notify "Bắt đầu pg_dump ${PG_DB} (tag=${TAG})"
docker exec "$PG_CONTAINER" pg_dump \
	--username="$PG_USER" --dbname="$PG_DB" \
	--format=plain --no-owner --no-privileges \
	| gzip -9 > "$DUMP_FILE"

SIZE_BYTES=$(stat -c %s "$DUMP_FILE")
if [[ "$SIZE_BYTES" -lt 1048576 ]]; then
	notify "WARN: dump size ${SIZE_BYTES} bytes < 1MB, nghi ngờ DB rỗng"
fi

# ------ 2. GPG symmetric encrypt ------
notify "GPG encrypt → ${ENC_FILE##*/}"
echo "$GPG_PASS" | gpg --batch --yes --passphrase-fd 0 \
	--symmetric --cipher-algo AES256 \
	--output "$ENC_FILE" "$DUMP_FILE"
rm -f "$DUMP_FILE"

SIZE=$(du -h "$ENC_FILE" | cut -f1)
notify "Encrypted OK: ${ENC_FILE##*/} (${SIZE})"

# ------ 3. Upload R2 ------
notify "Upload R2 → ${R2_REMOTE}/${TAG}/"
rclone copy "$ENC_FILE" "${R2_REMOTE}/${TAG}/" \
	--s3-no-check-bucket --timeout=10m --retries=3 \
	--stats=0 --quiet

# ------ 4. Retention local ------
find "$BACKUP_DIR" -name "${PG_DB}-daily-*.sql.gz.gpg" -mtime +"$DAILY_KEEP" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "${PG_DB}-weekly-*.sql.gz.gpg" -mtime +"$WEEKLY_KEEP" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "${PG_DB}-monthly-*.sql.gz.gpg" -mtime +"$MONTHLY_KEEP" -delete 2>/dev/null || true

# ------ 5. Retention R2 (prefix daily/) ------
# rclone `--min-age` giữ file cũ hơn N ngày rồi delete.
retention_r2() {
	local prefix="$1"; local keep="$2"
	rclone delete "${R2_REMOTE}/${prefix}/" --min-age "${keep}d" \
		--include "${PG_DB}-*.sql.gz.gpg" --quiet 2>/dev/null || true
}
retention_r2 "daily" "$DAILY_KEEP"
retention_r2 "weekly" "$WEEKLY_KEEP"
retention_r2 "monthly" "$MONTHLY_KEEP"

notify "Backup DONE (${TAG}) — ${SIZE}, retention ${DAILY_KEEP}d/${WEEKLY_KEEP}d/${MONTHLY_KEEP}d"
exit 0
