#!/usr/bin/env bash
# Despliega la última versión de main (#35). Lo usa también GitHub Actions por SSH.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"

if [[ ! -f infra/.env.prod ]]; then
  echo "Falta infra/.env.prod. Ejecuta primero ./infra/scripts/generar-env.sh" >&2
  exit 1
fi

git fetch --quiet origin main
git reset --hard origin/main

COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --remove-orphans
docker image prune -f >/dev/null

"${COMPOSE[@]}" ps
echo "Despliegue terminado: $(git rev-parse --short HEAD)"
