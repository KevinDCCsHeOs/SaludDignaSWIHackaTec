#!/usr/bin/env bash
# Instala de forma idempotente el cron diario a las 03:00 para respaldos MySQL (#36).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$RAIZ/infra/scripts/respaldar-mysql.sh"
LOG_FILE="/var/log/salud-digna-backup.log"
LINEA="0 3 * * * $SCRIPT >> $LOG_FILE 2>&1"

chmod +x "$SCRIPT" "$RAIZ/infra/scripts/restaurar-mysql.sh"

(crontab -l 2>/dev/null | grep -v "respaldar-mysql.sh" || true; echo "$LINEA") | crontab -
echo "[cron] Programado respaldo diario a las 03:00:"
crontab -l | grep "respaldar-mysql.sh"
