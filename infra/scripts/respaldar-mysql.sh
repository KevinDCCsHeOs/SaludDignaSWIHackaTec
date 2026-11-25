#!/usr/bin/env bash
# Respaldo diario automatizado de MySQL 8 con rotación (7 diarios + 4 semanales)
# y copia opcional fuera de la VPS vía rsync/SFTP (#36).
# Uso manual: ./infra/scripts/respaldar-mysql.sh
# Cron diario 03:00: 0 3 * * * /opt/salud-digna/infra/scripts/respaldar-mysql.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$RAIZ/infra/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$RAIZ/infra/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DIARIOS_DIR="$BACKUP_DIR/diarios"
SEMANALES_DIR="$BACKUP_DIR/semanales"
FECHA="$(date -u +%Y%m%d_%H%M%S)"
DIA_SEMANA="$(date -u +%u)" # 7 = domingo
ARCHIVO="$DIARIOS_DIR/salud_digna_${FECHA}.sql.gz"

log_json() {
  local nivel="$1"
  local evento="$2"
  local detalle="$3"
  printf '{"timestamp":"%s","servicio":"backup-mysql","nivel":"%s","evento":"%s","detalle":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$nivel" "$evento" "$detalle"
}

notificar_alerta() {
  local texto="$1"
  if [[ -n "${ALERTA_WEBHOOK_URL:-}" ]]; then
    curl -fsS -X POST -H "Content-Type: application/json" \
      -d "{\"content\":\"[Salud Digna VPS] ${texto}\",\"text\":\"[Salud Digna VPS] ${texto}\"}" \
      "$ALERTA_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

mkdir -p "$DIARIOS_DIR" "$SEMANALES_DIR"
chmod 700 "$BACKUP_DIR" "$DIARIOS_DIR" "$SEMANALES_DIR"

log_json "info" "backup_iniciado" "Generando respaldo comprimido en $ARCHIVO"

if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mysql \
  sh -c 'exec mysqldump --single-transaction --quick --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip -9 > "$ARCHIVO"; then
  rm -f "$ARCHIVO"
  log_json "error" "backup_fallido" "Fallo al ejecutar mysqldump"
  notificar_alerta "ERROR: Falló el respaldo diario de MySQL ($FECHA)."
  exit 1
fi

chmod 600 "$ARCHIVO"

# Validar integridad gzip del archivo recién creado
if ! gzip -t "$ARCHIVO"; then
  rm -f "$ARCHIVO"
  log_json "error" "backup_corrupto" "El archivo gzip falló la prueba de integridad"
  notificar_alerta "ERROR: El respaldo MySQL ($FECHA) resultó corrupto."
  exit 1
fi

TAMANO="$(du -h "$ARCHIVO" | awk '{print $1}')"
log_json "info" "backup_creado" "Respaldo válido ($TAMANO): $(basename "$ARCHIVO")"

# Copia semanal los domingos (retención 4 semanas)
if [[ "$DIA_SEMANA" == "7" ]]; then
  cp "$ARCHIVO" "$SEMANALES_DIR/$(basename "$ARCHIVO")"
  chmod 600 "$SEMANALES_DIR/$(basename "$ARCHIVO")"
fi

# Rotación: conservar 7 diarios y 4 semanales
ls -1t "$DIARIOS_DIR"/salud_digna_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$SEMANALES_DIR"/salud_digna_*.sql.gz 2>/dev/null | tail -n +5 | xargs -r rm -f

# Copia externa fuera de la VPS (cPanel / servidor remoto vía rsync sobre SSH)
if [[ -n "${BACKUP_REMOTO_DESTINO:-}" ]]; then
  RSYNC_SSH="ssh -o StrictHostKeyChecking=accept-new"
  if [[ -n "${BACKUP_REMOTO_LLAVE:-}" ]]; then
    RSYNC_SSH="$RSYNC_SSH -i $BACKUP_REMOTO_LLAVE"
  fi
  if rsync -az --delete -e "$RSYNC_SSH" "$BACKUP_DIR/" "$BACKUP_REMOTO_DESTINO/"; then
    log_json "info" "backup_remoto_ok" "Sincronizado fuera de la VPS"
  else
    log_json "warn" "backup_remoto_fallido" "Falló rsync al destino remoto"
    notificar_alerta "AVISO: El respaldo local existe, pero falló la copia externa."
  fi
fi

log_json "info" "backup_completado" "Ciclo de respaldo y rotación finalizado"
