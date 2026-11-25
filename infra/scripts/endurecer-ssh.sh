#!/usr/bin/env bash
# Desactiva el acceso SSH con contraseña (#35): solo se entra con llave. Root conserva acceso
# solo con llave (tu llave personal), para tareas de administración (apt, reinicios).
# Ejecutar como root SOLO después de comprobar que entras con llave como deploy y como root.
#
# Aviso: si la terminal web de hPanel entra por SSH con contraseña, dejará de funcionar.
# Para revertir desde una sesión que siga abierta: borra /etc/ssh/sshd_config.d/10-salud-digna.conf
# y ejecuta `systemctl reload ssh`. Si pierdes todo acceso, usa las opciones de recuperación
# de la VPS en hPanel.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este script como root." >&2
  exit 1
fi

if [[ ! -s /home/deploy/.ssh/authorized_keys ]]; then
  echo "El usuario deploy no tiene llaves autorizadas. Ejecuta primero crear-usuario-despliegue.sh" >&2
  exit 1
fi

read -r -p "¿Ya entraste con llave como 'deploy' Y como 'root' desde tu computadora? (si/no) " RESPUESTA
if [[ "$RESPUESTA" != "si" ]]; then
  echo "Primero comprueba el acceso con llave. No se cambió nada."
  exit 1
fi

CONFIG="/etc/ssh/sshd_config.d/10-salud-digna.conf"
cat > "$CONFIG" <<'SSHD'
# Endurecimiento de SSH (#35)
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
SSHD

# Validar antes de aplicar: si la configuración es inválida, se revierte
if ! sshd -t; then
  rm -f "$CONFIG"
  echo "Configuración inválida de sshd; se revirtió sin aplicar cambios." >&2
  exit 1
fi

systemctl reload ssh
echo "SSH endurecido: solo llaves. Mantén esta sesión abierta y prueba de nuevo 'ssh deploy@<ip>' y 'ssh root@<ip>'."
