#!/usr/bin/env bash
# Emite el certificado de Let's Encrypt para app., api. y wa.<dominio> (#35).
# Se ejecuta UNA vez antes del primer despliegue (Nginx aún no ocupa el puerto 80).
# Las renovaciones las hace el contenedor `certbot` automáticamente.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$RAIZ/infra/.env.prod"

for sub in app api wa; do
  if ! getent hosts "$sub.$DOMINIO" >/dev/null; then
    echo "El DNS de $sub.$DOMINIO aún no resuelve. Crea el registro A y espera a que propague." >&2
    exit 1
  fi
done

mkdir -p "$RAIZ/infra/data/letsencrypt" "$RAIZ/infra/data/certbot-www"

docker run --rm -p 80:80 \
  -v "$RAIZ/infra/data/letsencrypt:/etc/letsencrypt" \
  certbot/certbot certonly --standalone --non-interactive --agree-tos \
  --email "$CORREO_LETSENCRYPT" \
  -d "app.$DOMINIO" -d "api.$DOMINIO" -d "wa.$DOMINIO"

echo "Certificado emitido en infra/data/letsencrypt/live/app.$DOMINIO/"
