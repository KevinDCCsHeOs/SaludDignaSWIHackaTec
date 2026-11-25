#!/usr/bin/env bash
# Usuario no root y llaves SSH para operar y desplegar la VPS (#35). Ejecutar UNA vez como root:
#   ./infra/scripts/crear-usuario-despliegue.sh "ssh-ed25519 AAAA... tu-correo"
#
# El argumento es tu llave PÚBLICA personal (la de tu computadora, ~/.ssh/id_ed25519.pub).
# El script:
#   1. Crea el usuario `deploy` sin contraseña, con acceso a Docker.
#   2. Autoriza tu llave personal para entrar como `deploy` y como `root`.
#   3. Genera una llave exclusiva para GitHub Actions que SOLO puede ejecutar desplegar.sh
#      (comando forzado: aunque se filtrara, no abre una terminal en el servidor).
#   4. Le pasa a `deploy` la carpeta del proyecto.
# NO desactiva el acceso de root ni las contraseñas: eso va en endurecer-ssh.sh, después de probar.
set -euo pipefail

USUARIO="deploy"
DIRECTORIO="/opt/salud-digna"
LLAVE_GITHUB="/root/llave-despliegue-github"

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este script como root." >&2
  exit 1
fi

LLAVE_PERSONAL="${1:-}"
if [[ ! "$LLAVE_PERSONAL" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256)\ [A-Za-z0-9+/=]+ ]]; then
  echo "Uso: $0 \"ssh-ed25519 AAAA... comentario\"   (tu llave PÚBLICA, nunca la privada)" >&2
  exit 1
fi

echo "==> Usuario $USUARIO"
if ! id "$USUARIO" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$USUARIO"
fi
# Nota: el grupo docker equivale a privilegios de administrador sobre los contenedores.
usermod -aG docker "$USUARIO"

echo "==> Llave de despliegue para GitHub Actions"
if [[ ! -f "$LLAVE_GITHUB" ]]; then
  ssh-keygen -t ed25519 -N "" -C "github-actions-salud-digna" -f "$LLAVE_GITHUB" >/dev/null
fi
chmod 600 "$LLAVE_GITHUB"

echo "==> authorized_keys de $USUARIO"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
{
  echo "$LLAVE_PERSONAL"
  echo "command=\"cd $DIRECTORIO && ./infra/scripts/desplegar.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat "$LLAVE_GITHUB.pub")"
} > "/home/$USUARIO/.ssh/authorized_keys"
chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/authorized_keys"
chmod 600 "/home/$USUARIO/.ssh/authorized_keys"

echo "==> Tu llave personal también para root (administración sin contraseña)"
install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
grep -qxF "$LLAVE_PERSONAL" /root/.ssh/authorized_keys || echo "$LLAVE_PERSONAL" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo "==> Carpeta del proyecto para $USUARIO"
chown -R "$USUARIO:$USUARIO" "$DIRECTORIO"
chmod 600 "$DIRECTORIO/infra/.env.prod" 2>/dev/null || true
# Root puede seguir usando git en la carpeta aunque ya no sea el dueño
git config --system --add safe.directory "$DIRECTORIO"

IP="$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<SIGUIENTE

Listo. Ahora:
  1. Desde TU computadora prueba (en otra terminal, sin cerrar esta) que entras sin contraseña:
       ssh $USUARIO@$IP
       ssh root@$IP
  2. En GitHub → Settings → Secrets and variables → Actions → New repository secret:
       VPS_HOST       = $IP
       VPS_USUARIO    = $USUARIO
       VPS_LLAVE_SSH  = el contenido completo de: cat $LLAVE_GITHUB
     Copia la llave directo de la terminal a GitHub; no la pegues en chats ni documentos.
  3. Cuando el secreto esté guardado, borra la copia del servidor:
       shred -u $LLAVE_GITHUB
  4. Solo después de confirmar el paso 1: ./infra/scripts/endurecer-ssh.sh
SIGUIENTE
