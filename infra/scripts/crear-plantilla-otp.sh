#!/usr/bin/env bash
# Crea en Meta la plantilla de autenticación `sd_codigo_verificacion` (es_MX y en_US) que el API
# usa para enviar el OTP fuera de la ventana de 24 h (#8). Usa WA_ACCESS_TOKEN de infra/.env.prod,
# que nunca se imprime. Ejecutar en la VPS:
#   ./infra/scripts/crear-plantilla-otp.sh <WABA_ID>
# El WABA_ID es el identificador de la cuenta de WhatsApp Business (WhatsApp → Configuración de la API).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
WABA_ID="${1:-}"
if [[ ! "$WABA_ID" =~ ^[0-9]+$ ]]; then
  echo "Uso: $0 <WABA_ID numérico>" >&2
  exit 1
fi

TOKEN="$(grep '^WA_ACCESS_TOKEN=' "$RAIZ/infra/.env.prod" | cut -d'"' -f2)"
if [[ -z "$TOKEN" ]]; then
  echo "Falta WA_ACCESS_TOKEN en infra/.env.prod" >&2
  exit 1
fi

for idioma in es_MX en_US; do
  if [[ "$idioma" == "es_MX" ]]; then boton="Copiar código"; else boton="Copy code"; fi
  echo "==> Plantilla sd_codigo_verificacion ($idioma)"
  curl -sS -X POST "https://graph.facebook.com/v21.0/$WABA_ID/message_templates" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"sd_codigo_verificacion\",
      \"language\": \"$idioma\",
      \"category\": \"AUTHENTICATION\",
      \"components\": [
        { \"type\": \"BODY\", \"add_security_recommendation\": true },
        { \"type\": \"FOOTER\", \"code_expiration_minutes\": 15 },
        { \"type\": \"BUTTONS\", \"buttons\": [
          { \"type\": \"OTP\", \"otp_type\": \"COPY_CODE\", \"text\": \"$boton\" }
        ] }
      ]
    }"
  echo
done

echo "Revisa el estado (APPROVED/PENDING/REJECTED) con:"
echo "  curl -sS \"https://graph.facebook.com/v21.0/$WABA_ID/message_templates?name=sd_codigo_verificacion&fields=name,language,status\" -H \"Authorization: Bearer \$TOKEN\""
