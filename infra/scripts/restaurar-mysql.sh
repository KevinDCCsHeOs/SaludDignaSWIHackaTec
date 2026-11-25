#!/usr/bin/env bash
# Restauración controlada y simulacro de respaldo MySQL (#36).
# Por seguridad restaura en una BD limpia de prueba (`salud_digna_prueba`), salvo
# que se pase explícitamente `--confirmar-produccion`.
# Uso:
#   ./infra/scripts/restaurar-mysql.sh /backups/diarios/salud_digna_YYYYMMDD_HHMMSS.sql.gz
#   ./infra/scripts/restaurar-mysql.sh <archivo.sql.gz> --confirmar-produccion
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <archivo.sql.gz> [--confirmar-produccion]" >&2
  exit 1
fi

ARCHIVO="$1"
MODO="${2:-simulacro}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$RAIZ/infra/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$RAIZ/infra/docker-compose.prod.yml}"

if [[ ! -f "$ARCHIVO" ]]; then
  echo "Error: no existe el archivo $ARCHIVO" >&2
  exit 1
fi

gzip -t "$ARCHIVO"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BD_DESTINO="salud_digna_prueba"
if [[ "$MODO" == "--confirmar-produccion" ]]; then
  BD_DESTINO="${MYSQL_DATABASE:-salud_digna}"
  echo "[restore] ATENCIÓN: restaurando sobre la base de producción '$BD_DESTINO'"
else
  echo "[restore] Simulacro seguro sobre BD limpia '$BD_DESTINO'"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mysql \
  sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE IF EXISTS \`${BD_DESTINO}\`; CREATE DATABASE \`${BD_DESTINO}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'"

gunzip -c "$ARCHIVO" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mysql \
  sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"${BD_DESTINO}\""

echo "[restore] Verificando conteo de tablas restauradas en '$BD_DESTINO':"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mysql \
  sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"${BD_DESTINO}\" -e 'SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = \"${BD_DESTINO}\" ORDER BY table_name;'"

echo "[restore] Restauración completada sin errores."
