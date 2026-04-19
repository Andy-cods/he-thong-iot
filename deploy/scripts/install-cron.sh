#!/usr/bin/env bash
# =============================================================
# V1.4 Phase F — Install cron entries cho backup + restore drill
# + health check.
#
# Idempotent: nếu /etc/cron.d/hethong-iot đã tồn tại, ghi đè.
# =============================================================
set -euo pipefail

CRON_FILE="${CRON_FILE:-/etc/cron.d/hethong-iot}"
SCRIPT_DIR="${SCRIPT_DIR:-/opt/hethong-iot/scripts}"
ENV_FILE="${ENV_FILE:-/opt/hethong-iot/.env}"
LOG_DIR="${LOG_DIR:-/var/log}"

if [[ $(id -u) -ne 0 ]]; then
	echo "Cần chạy bằng root (sudo)" >&2
	exit 1
fi

for script in backup-offsite.sh restore-drill.sh health-check.sh; do
	if [[ ! -x "${SCRIPT_DIR}/${script}" ]]; then
		echo "Thiếu hoặc chưa chmod +x: ${SCRIPT_DIR}/${script}" >&2
		exit 2
	fi
done

cat > "$CRON_FILE" <<EOF
# /etc/cron.d/hethong-iot — V1.4 Phase F auto-install
# KHÔNG sửa tay, chạy lại install-cron.sh nếu cần đổi.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
BASH_ENV=${ENV_FILE}

# Backup off-site encrypted → R2, mỗi đêm 02:00
0 2 * * * root ${SCRIPT_DIR}/backup-offsite.sh >> ${LOG_DIR}/iot-backup.log 2>&1

# Restore drill Chủ Nhật 03:00
0 3 * * 0 root ${SCRIPT_DIR}/restore-drill.sh >> ${LOG_DIR}/iot-restore-drill.log 2>&1

# Health check mỗi 5 phút
*/5 * * * * root ${SCRIPT_DIR}/health-check.sh >> ${LOG_DIR}/iot-health.log 2>&1
EOF

chmod 0644 "$CRON_FILE"
echo "Cron installed: $CRON_FILE"
crontab -l 2>/dev/null || true
echo "---"
cat "$CRON_FILE"
