#!/usr/bin/env bash
# Genera infra/.env.prod con secretos aleatorios (#35). No sobrescribe uno existente.
# Uso: ./infra/scripts/generar-env.sh <dominio> <correo-letsencrypt>
set -euo pipefail

DOMINIO="${1:?Uso: generar-env.sh <dominio> <correo>}"
CORREO="${2:?Uso: generar-env.sh <dominio> <correo>}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DESTINO="$RAIZ/infra/.env.prod"

if [[ -f "$DESTINO" ]]; then
  echo "Ya existe $DESTINO; no se sobrescribe. Bórralo a mano si quieres regenerarlo." >&2
  exit 1
fi

aleatorio() { openssl rand -hex "${1:-32}"; }

umask 077
cat > "$DESTINO" <<VARS
DOMINIO="$DOMINIO"
CORREO_LETSENCRYPT="$CORREO"
MYSQL_ROOT_PASSWORD="$(aleatorio 24)"
MYSQL_PASSWORD="$(aleatorio 24)"
JWT_ACCESS_SECRET="$(aleatorio)"
JWT_REFRESH_SECRET="$(aleatorio)"
API_SERVICE_TOKEN="$(aleatorio)"
ENCRYPTION_KEY="$(aleatorio 32)"
CURP_HASH_PEPPER="$(aleatorio)"
WA_VERIFY_TOKEN="$(aleatorio 16)"
WA_APP_SECRET=""
WA_ACCESS_TOKEN=""
WA_PHONE_NUMBER_ID=""
LLM_PROVIDER="none"
LLM_API_KEY=""
EXPO_PUSH_DESHABILITADO="0"
VARS
chmod 600 "$DESTINO"

echo "Listo: $DESTINO (permisos 600)."
echo "Copia este valor en Meta → WhatsApp → Configuración → Webhook → 'Token de verificación':"
grep '^WA_VERIFY_TOKEN=' "$DESTINO" | cut -d'"' -f2
echo "Después llena WA_APP_SECRET, WA_ACCESS_TOKEN y WA_PHONE_NUMBER_ID (ver docs/whatsapp-meta.md)."
