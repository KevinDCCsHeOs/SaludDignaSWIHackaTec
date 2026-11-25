# Operación: Respaldos, Monitoreo y Logs — Salud Digna Omnicanal

Guía operativa para continuidad, respaldos automatizados, monitoreo de disponibilidad y logs estructurados sin PII (Issue #36).

---

## 1. Respaldos diarios de MySQL 8

- **Script:** [`infra/scripts/respaldar-mysql.sh`](../infra/scripts/respaldar-mysql.sh)
- **Programación (cron 03:00 UTC):** instalar con `./infra/scripts/instalar-cron-respaldos.sh`
- **Método:** `mysqldump --single-transaction --quick --routines --triggers | gzip -9` (sin bloquear lecturas en producción).
- **Integridad:** valida cada archivo con `gzip -t` inmediatamente después de crearlo.
- **Rotación:**
  - `/backups/diarios/` → conserva los últimos **7 respaldos diarios**.
  - `/backups/semanales/` → copia automática cada domingo, conserva **4 semanales**.
- **Copia fuera de la VPS (cPanel / almacenamiento externo):** configurar `BACKUP_REMOTO_DESTINO` (ej. `usuario@cpanel.tudominio.com:~/backups-salud-digna`) y `BACKUP_REMOTO_LLAVE` en `infra/.env.prod`; el script sincroniza por `rsync` sobre SSH y alerta si falla.

---

## 2. Simulacro de restauración (Runbook)

El script [`infra/scripts/restaurar-mysql.sh`](../infra/scripts/restaurar-mysql.sh) restaura por defecto en una base limpia **`salud_digna_prueba`** para verificar integridad sin tocar producción:

```bash
cd /opt/salud-digna
./infra/scripts/respaldar-mysql.sh
ULTIMO=$(ls -1t /backups/diarios/salud_digna_*.sql.gz | head -n 1)
./infra/scripts/restaurar-mysql.sh "$ULTIMO"
```

### Checklist de validación del simulacro

1. `gzip -t` pasa con código `0`.
2. Creación limpia de `salud_digna_prueba` (`utf8mb4_unicode_ci`) y carga sin errores SQL.
3. Conteo de filas confirmado en tablas críticas (`pacientes`, `tramites`, `eventos`, `tickets`, `interacciones`, `auditoria`).
4. Limpieza posterior: `DROP DATABASE salud_digna_prueba;`.

Para recuperación real sobre producción (solo en emergencia):

```bash
./infra/scripts/restaurar-mysql.sh "$ULTIMO" --confirmar-produccion
```

---

## 3. Healthchecks y auto-recuperación de contenedores

Todos los servicios en [`infra/docker-compose.prod.yml`](../infra/docker-compose.prod.yml) y [`infra/docker/Dockerfile`](../infra/docker/Dockerfile) tienen `restart: unless-stopped` y `healthcheck`:

| Servicio | Endpoint / Probe | Política de reinicio |
| --- | --- | --- |
| `mysql` | `mysqladmin ping` (cada 10 s) | `unless-stopped` |
| `redis` | `redis-cli ping` (cada 10 s, AOF activo) | `unless-stopped` |
| `api` | `GET http://127.0.0.1:3000/health` (reporta estado, `uptimeSegundos`, `memoriaRssMb`) | `unless-stopped` |
| `whatsapp-bot` | `GET http://127.0.0.1:3001/health` | `unless-stopped` |
| `web` | `GET http://127.0.0.1:3002/api/health` | `unless-stopped` |
| `nginx` | Probe HTTP local (cada 30 s) | `unless-stopped` |

---

## 4. Monitoreo de Uptime y Alertas (Uptime Kuma)

`docker-compose.prod.yml` incluye el servicio opcional **`uptime-kuma`** (perfil `monitoreo`, ligado solo a `127.0.0.1:3003` para acceso seguro vía túnel SSH):

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod --profile monitoreo up -d
# Acceso seguro desde tu equipo:
ssh -L 3003:127.0.0.1:3003 root@<IP_VPS>
# Abrir http://localhost:3003
```

Monitores recomendados (intervalo 60 s, notificación a **Discord** o **Telegram**):
- `https://api.<dominio>/health` (HTTP 200 + palabra `"estado":"ok"`)
- `https://app.<dominio>/api/health` (HTTP 200)
- `https://wa.<dominio>/health` (HTTP 200)

Adicionalmente, el script de respaldos envía alerta inmediata al webhook configurado en `ALERTA_WEBHOOK_URL` si falla `mysqldump` o la copia remota.

---

## 5. Logs estructurados sin datos personales sensibles

- **API:** `SanitizedLogger` ([`apps/api/src/privacidad/sanitizador-logs.ts`](../apps/api/src/privacidad/sanitizador-logs.ts)) redacta automáticamente CURP, teléfonos, correos, tokens y claves sensibles (`password`, `otp`, `rfc`, etc.). Con `LOG_FORMATO=json` emite JSON estructurado por línea (`timestamp`, `nivel`, `servicio`, `mensaje`).
- **Docker:** rotación configurada en todos los contenedores (`max-size: 10m`, `max-file: 3`) para evitar saturación de disco en la VPS.
