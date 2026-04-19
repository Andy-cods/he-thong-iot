#!/usr/bin/env bash
# =============================================================
# V1.4 Phase F — Restore drill (weekly Chủ Nhật 03:00).
#
# Flow:
#   1. rclone pull bản backup daily mới nhất từ R2
#   2. gpg decrypt
#   3. Spin up scratch Postgres container tạm (port 55432)
#   4. psql restore vào scratch DB hethong_iot_drill
#   5. Compare table count prod vs scratch → Telegram report
#   6. Cleanup scratch container + file tmp
#
# Cron: 0 3 * * 0 /opt/hethong-iot/scripts/restore-drill.sh
# =============================================================
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-iot_postgres}"
PG_USER="${PG_USER:-hethong_app}"
PG_DB="${PG_DB:-hethong_iot}"
DRILL_DB="${DRILL_DB:-hethong_iot_drill}"
SCRATCH_DIR="${SCRATCH_DIR:-/tmp/iot-restore-drill}"
SCRATCH_PORT="${SCRATCH_PORT:-55432}"
SCRATCH_NAME="${SCRATCH_NAME:-iot-restore-drill}"
LOG_FILE="${LOG_FILE:-/var/log/iot-restore-drill.log}"

R2_REMOTE="${R2_REMOTE:-r2:iot-backups}"
GPG_PASS_FILE="${GPG_PASS_FILE:-/run/secrets/backup_gpg_key}"
if [[ -f "$GPG_PASS_FILE" ]]; then
	GPG_PASS=$(cat "$GPG_PASS_FILE")
elif [[ -n "${BACKUP_GPG_PASSPHRASE:-}" ]]; then
	GPG_PASS="$BACKUP_GPG_PASSPHRASE"
else
	echo "FATAL: thiếu GPG passphrase ($GPG_PASS_FILE và ENV BACKUP_GPG_PASSPHRASE trống)" >&2
	exit 1
fi

TG_BOT="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT="${TELEGRAM_CHAT_ID:-}"

log() {
	local msg="[restore-drill $(date -Iseconds)] $1"
	echo "$msg"
	mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
	echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}
notify() {
	local msg="$1"; log "$msg"
	if [[ -n "$TG_BOT" && -n "$TG_CHAT" ]]; then
		curl -sS --max-time 10 \
			-d "chat_id=${TG_CHAT}" \
			-d "text=[iot restore-drill] ${msg}" \
			"https://api.telegram.org/bot${TG_BOT}/sendMessage" > /dev/null || true
	fi
}

cleanup() {
	docker rm -f "$SCRATCH_NAME" >/dev/null 2>&1 || true
	rm -rf "$SCRATCH_DIR"
}
trap 'notify "FAIL dòng $LINENO (exit $?)"; cleanup' ERR
trap cleanup EXIT

mkdir -p "$SCRATCH_DIR"

# ------ 1. Pull latest daily backup ------
notify "Bắt đầu restore drill — pull latest daily từ R2"
LATEST=$(rclone lsf "${R2_REMOTE}/daily/" --include "${PG_DB}-daily-*.sql.gz.gpg" | sort | tail -1 || true)
if [[ -z "$LATEST" ]]; then
	notify "FAIL: không tìm thấy file daily nào trong ${R2_REMOTE}/daily/"
	exit 2
fi
notify "Pull ${LATEST}"
rclone copy "${R2_REMOTE}/daily/${LATEST}" "$SCRATCH_DIR/" --quiet --timeout=10m

# ------ 2. GPG decrypt ------
ENC_FILE="${SCRATCH_DIR}/${LATEST}"
DECRYPTED="${SCRATCH_DIR}/restore.sql.gz"
echo "$GPG_PASS" | gpg --batch --yes --passphrase-fd 0 \
	--decrypt --output "$DECRYPTED" "$ENC_FILE"

# ------ 3. Spin up scratch Postgres ------
notify "Spin up scratch Postgres port ${SCRATCH_PORT}"
docker rm -f "$SCRATCH_NAME" >/dev/null 2>&1 || true
docker run --rm -d --name "$SCRATCH_NAME" \
	-e POSTGRES_PASSWORD=scratch \
	-e POSTGRES_DB="$DRILL_DB" \
	-p "${SCRATCH_PORT}:5432" \
	postgres:16 > /dev/null

# Đợi Postgres ready (max 30s)
for i in $(seq 1 30); do
	if docker exec "$SCRATCH_NAME" pg_isready -U postgres >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

# ------ 4. Restore ------
notify "psql restore vào ${DRILL_DB}"
zcat "$DECRYPTED" | docker exec -i "$SCRATCH_NAME" psql -U postgres -d "$DRILL_DB" >/dev/null

# ------ 5. Verify ------
# Lấy list bảng + count vào JSON compare với prod
count_tables() {
	local container="$1"; local user="$2"; local db="$3"
	docker exec "$container" psql -U "$user" -d "$db" -tAc \
		"SELECT json_object_agg(t.table_name, c.cnt) FROM (
		  SELECT table_name FROM information_schema.tables
		  WHERE table_schema='app' AND table_type='BASE TABLE'
		) t, LATERAL (
		  SELECT count(*) AS cnt FROM ( SELECT 1 FROM app.\"\"||quote_ident(t.table_name) ) s
		) c;" 2>/dev/null || echo "{}"
}

# Prod counts
PROD_COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
	"SELECT COUNT(*) FROM app.item" | tr -d ' ')
DRILL_COUNT=$(docker exec "$SCRATCH_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
	"SELECT COUNT(*) FROM app.item" | tr -d ' ')

# Table count
PROD_TABLES=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
	"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='app'" | tr -d ' ')
DRILL_TABLES=$(docker exec "$SCRATCH_NAME" psql -U postgres -d "$DRILL_DB" -tAc \
	"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='app'" | tr -d ' ')

if [[ "$PROD_TABLES" != "$DRILL_TABLES" ]]; then
	notify "WARN: table count mismatch — prod=${PROD_TABLES} drill=${DRILL_TABLES}"
fi

if [[ "$PROD_COUNT" != "$DRILL_COUNT" ]]; then
	notify "WARN: app.item count mismatch — prod=${PROD_COUNT} drill=${DRILL_COUNT}"
fi

notify "Restore drill OK: ${DRILL_TABLES}/${PROD_TABLES} tables, app.item ${DRILL_COUNT}/${PROD_COUNT} rows (backup: ${LATEST})"
exit 0
