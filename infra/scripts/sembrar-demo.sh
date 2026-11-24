#!/usr/bin/env bash
# Carga (o reinicia con --reset) los datos ficticios del demo y reinicia el API (#17, #35).
#   ./infra/scripts/sembrar-demo.sh          # primera vez
#   ./infra/scripts/sembrar-demo.sh --reset  # antes de cada ensayo o del demo final
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod)

if [[ "${1:-}" == "--reset" ]]; then
  "${COMPOSE[@]}" run --rm --no-deps migraciones npm run demo:reset
else
  "${COMPOSE[@]}" run --rm --no-deps migraciones npm run seed
fi

# El API recarga trámites, tickets y timeline desde MySQL al arrancar
"${COMPOSE[@]}" restart api whatsapp-bot
