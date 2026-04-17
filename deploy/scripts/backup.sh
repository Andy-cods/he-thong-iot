#!/usr/bin/env bash
# =============================================================
# Backup DB hethong_iot: pg_dump | gpg | lưu local + rsync off-site
# Chạy cron: 0 3 * * * /opt/hethong-iot/scripts/backup.sh
# =============================================================
set -euo pipefail

# --- Config (override bằng env) ---
# Postgres IoT là container riêng (iot_postgres), dump qua `docker exec`
# Nếu muốn dump host-local, set PG_MODE=host và PG_HOST/PG_PORT.
PG_MODE="${PG_MODE:-docker}"
PG_CONTAINER="${PG_CONTAINER:-iot_postgres}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-hethong_app}"
PG_DB="${PG_DB:-hethong_iot}"
BACKUP_DIR="${BACKUP_DIR:-/opt/hethong-iot/backups}"
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@iot.domain.vn}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Off-site (placeholder — setup rsync key trước)
OFFSITE_HOST="${OFFSITE_HOST:-}"                    # ví dụ: backup@offsite.example.com
OFFSITE_PATH="${OFFSITE_PATH:-/srv/backup/hethong-iot}"

# Telegram alert (optional)
TG_BOT="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT="${TELEGRAM_CHAT_ID:-}"

# --- Helpers ---
notify() {
	local msg="$1"
	echo "[backup $(date -Iseconds)] $msg"
	if [[ -n "$TG_BOT" && -n "$TG_CHAT" ]]; then
		curl -sS --max-time 10 \
			-d "chat_id=${TG_CHAT}" \
			-d "text=[he-thong-iot backup] ${msg}" \
			"https://api.telegram.org/bot${TG_BOT}/sendMessage" > /dev/null || true
	fi
}

trap 'notify "FAIL tại dòng $LINENO (exit $?)"' ERR

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/${PG_DB}-${TS}.sql.gz"
ENC_FILE="${DUMP_FILE}.gpg"

# --- pg_dump + gzip ---
notify "Bắt đầu pg_dump ${PG_DB} (mode=${PG_MODE})"
if [[ "$PG_MODE" == "docker" ]]; then
	# Dump qua container iot_postgres (không cần pg_dump cài host)
	docker exec "$PG_CONTAINER" pg_dump \
		--username="$PG_USER" --dbname="$PG_DB" \
		--format=plain --no-owner --no-privileges \
	| gzip -9 > "$DUMP_FILE"
else
	PGPASSFILE="${PGPASSFILE:-$HOME/.pgpass}" \
		pg_dump \
			--host="$PG_HOST" --port="$PG_PORT" \
			--username="$PG_USER" --dbname="$PG_DB" \
			--format=plain --no-owner --no-privileges \
		| gzip -9 > "$DUMP_FILE"
fi

# --- GPG encrypt ---
if command -v gpg >/dev/null 2>&1 && gpg --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1; then
	gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" \
		--output "$ENC_FILE" "$DUMP_FILE"
	rm -f "$DUMP_FILE"
	FINAL_FILE="$ENC_FILE"
else
	notify "WARN: GPG recipient chưa setup, lưu plaintext"
	FINAL_FILE="$DUMP_FILE"
fi

SIZE=$(du -h "$FINAL_FILE" | cut -f1)
notify "Dump OK: ${FINAL_FILE} (${SIZE})"

# --- Rsync off-site (placeholder) ---
if [[ -n "$OFFSITE_HOST" ]]; then
	notify "Rsync off-site → ${OFFSITE_HOST}:${OFFSITE_PATH}"
	rsync -az --timeout=60 \
		"$FINAL_FILE" \
		"${OFFSITE_HOST}:${OFFSITE_PATH}/" \
		|| notify "WARN: rsync off-site thất bại, dump vẫn còn local"
fi

# --- Retention ---
find "$BACKUP_DIR" -name "${PG_DB}-*.sql.gz*" -mtime +"$RETENTION_DAYS" -delete
notify "Xoá backup cũ hơn ${RETENTION_DAYS} ngày. Done."
