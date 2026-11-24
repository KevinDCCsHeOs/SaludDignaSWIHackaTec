#!/usr/bin/env bash
# Preparación única de la VPS Ubuntu 24.04 (#35). Ejecutar como root:
#   curl -fsSL https://raw.githubusercontent.com/KevinDCCsHeOs/SaludDignaSWIHackaTec/main/infra/scripts/preparar-vps.sh -o preparar-vps.sh
#   less preparar-vps.sh   # revísalo antes de ejecutarlo
#   bash preparar-vps.sh
set -euo pipefail

REPO="https://github.com/KevinDCCsHeOs/SaludDignaSWIHackaTec.git"
DIRECTORIO="/opt/salud-digna"

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este script como root." >&2
  exit 1
fi

echo "==> Actualizando paquetes"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y git ufw fail2ban openssl ca-certificates curl

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Firewall: solo SSH, HTTP y HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "==> Swap de 2 GB (evita quedarse sin memoria al compilar las imágenes)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Código en $DIRECTORIO"
if [[ ! -d "$DIRECTORIO/.git" ]]; then
  git clone "$REPO" "$DIRECTORIO"
fi
mkdir -p "$DIRECTORIO/infra/data/letsencrypt" "$DIRECTORIO/infra/data/certbot-www"

cat <<'SIGUIENTE'

VPS lista. Siguientes pasos (ver infra/README.md):
  1. En tu DNS crea registros A de app, api y wa apuntando a la IP de esta VPS.
  2. cd /opt/salud-digna && ./infra/scripts/generar-env.sh <dominio> <correo>
  3. ./infra/scripts/emitir-certificados.sh
  4. ./infra/scripts/desplegar.sh
  5. ./infra/scripts/sembrar-demo.sh
SIGUIENTE
