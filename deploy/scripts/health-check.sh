#!/usr/bin/env bash
# =============================================================
# Health check: curl /api/health + /api/ready
# Cron: */5 * * * * /opt/hethong-iot/scripts/health-check.sh
# =============================================================
set -uo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8443/api/health}"
READY_URL="${READY_URL:-http://127.0.0.1:8443/api/ready}"
TIMEOUT="${TIMEOUT:-8}"

TG_BOT="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT="${TELEGRAM_CHAT_ID:-}"
STATE_FILE="${STATE_FILE:-/tmp/iot-health.state}"

alert() {
	local msg="$1"
	echo "[health $(date -Iseconds)] $msg"
	if [[ -n "$TG_BOT" && -n "$TG_CHAT" ]]; then
		curl -sS --max-time 10 \
			-d "chat_id=${TG_CHAT}" \
			-d "text=[he-thong-iot health] ${msg}" \
			"https://api.telegram.org/bot${TG_BOT}/sendMessage" > /dev/null || true
	fi
}

prev_state="UP"
[[ -f "$STATE_FILE" ]] && prev_state="$(cat "$STATE_FILE")"

# 1. Liveness
if ! curl -fsS --max-time "$TIMEOUT" "$HEALTH_URL" > /dev/null; then
	echo "DOWN" > "$STATE_FILE"
	[[ "$prev_state" == "UP" ]] && alert "DOWN: ${HEALTH_URL} không phản hồi"
	exit 1
fi

# 2. Readiness (DB, Redis, R2)
READY_RESP=$(curl -fsS --max-time "$TIMEOUT" "$READY_URL" 2>/dev/null || echo "")
if [[ -z "$READY_RESP" ]] || ! echo "$READY_RESP" | grep -q '"ready":true'; then
	echo "DEGRADED" > "$STATE_FILE"
	[[ "$prev_state" != "DEGRADED" ]] && alert "DEGRADED: readiness fail — ${READY_RESP:-empty}"
	exit 2
fi

echo "UP" > "$STATE_FILE"
if [[ "$prev_state" != "UP" ]]; then
	alert "RECOVERED: service trở lại UP"
fi
exit 0
