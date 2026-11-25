# Infraestructura local y despliegue

## Desarrollo local (`docker-compose.dev.yml`)

Levanta **MySQL 8** (`utf8mb4` / `utf8mb4_unicode_ci`) y **Redis 7** (con persistencia AOF):

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

Cadena de conexión local por defecto para `apps/api/.env`:

```env
DATABASE_URL="mysql://salud_digna_app:dev_app_password@localhost:3306/salud_digna?charset=utf8mb4"
REDIS_URL="redis://localhost:6379"
```

Para detener y conservar datos:

```bash
docker compose -f infra/docker-compose.dev.yml down
```

## Producción en la VPS Hostinger (#35)

Todo corre con Docker Compose en la VPS. Solo Nginx publica los puertos 80 y 443; MySQL y Redis quedan en la red interna.

| Subdominio | Servicio | Puerto interno |
| --- | --- | --- |
| `app.<dominio>` | Web: portal del paciente, consola y tableros (Next.js) | 3002 |
| `api.<dominio>` | Núcleo NestJS, REST y Socket.IO | 3000 |
| `wa.<dominio>/webhook` | Bot de WhatsApp (webhook de Meta) | 3001 |

| Archivo | Para qué |
| --- | --- |
| `docker/Dockerfile` | Imagen multi-etapa con un *target* por servicio (`api`, `whatsapp-bot`, `web`) |
| `docker-compose.prod.yml` | MySQL 8.4, Redis 7 (AOF), migraciones, api, bot, web, Nginx y certbot |
| `nginx/templates/default.conf.template` | HTTPS, WebSockets, límite de intentos en login/OTP y webhook |
| `.env.prod.example` | Variables necesarias (el archivo real, `.env.prod`, nunca se sube) |
| `scripts/*.sh` | Preparar la VPS, generar secretos, emitir certificados, desplegar y sembrar el demo |

### Primer despliegue (una sola vez)

**Antes de empezar** necesitas un dominio con acceso a su DNS (por ejemplo, el del cPanel) y la IP de la VPS (hPanel → VPS → Vista general).

1. **DNS:** crea tres registros `A` (`app`, `api` y `wa`) apuntando a la IP de la VPS. Comprueba que ya resuelven con `nslookup app.<dominio>`.
2. **Entra a la VPS** por SSH (`ssh root@<ip>`) o desde hPanel → VPS → *Terminal del navegador*.
3. **Prepara el servidor**: instala Docker, el firewall (22/80/443), fail2ban y 2 GB de swap, y clona el repo en `/opt/salud-digna`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/KevinDCCsHeOs/SaludDignaSWIHackaTec/main/infra/scripts/preparar-vps.sh -o preparar-vps.sh
   less preparar-vps.sh   # revísalo antes de ejecutarlo
   bash preparar-vps.sh
   ```

4. **Genera los secretos** (crea `infra/.env.prod` con permisos 600):

   ```bash
   cd /opt/salud-digna
   ./infra/scripts/generar-env.sh <dominio> <correo-para-lets-encrypt>
   ```

   El script imprime el `WA_VERIFY_TOKEN` que pegarás en Meta. Llena `WA_APP_SECRET`, `WA_ACCESS_TOKEN` y `WA_PHONE_NUMBER_ID` con `nano infra/.env.prod` (ver [`docs/whatsapp-meta.md`](../docs/whatsapp-meta.md)).

5. **Certificado HTTPS** (Let's Encrypt para los tres subdominios):

   ```bash
   ./infra/scripts/emitir-certificados.sh
   ```

6. **Despliega** (compila las imágenes, aplica migraciones y levanta todo):

   ```bash
   ./infra/scripts/desplegar.sh
   ```

7. **Carga los datos ficticios del demo:**

   ```bash
   ./infra/scripts/sembrar-demo.sh
   ```

8. **Verifica:** `https://api.<dominio>/health`, `https://app.<dominio>` y `https://wa.<dominio>/health` deben responder.

### Despliegues siguientes

- **Automático:** cada fusión a `main` ejecuta `.github/workflows/deploy.yml`, que entra por SSH y corre `desplegar.sh`. Para activarlo, agrega en GitHub → *Settings → Secrets and variables → Actions* los secretos `VPS_HOST` (IP), `VPS_USUARIO` (ej. `root`) y `VPS_LLAVE_SSH` (llave privada cuya pública esté en `~/.ssh/authorized_keys` de la VPS).
- **Manual:** `cd /opt/salud-digna && ./infra/scripts/desplegar.sh`.

### Operación diaria

```bash
cd /opt/salud-digna
C="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
$C ps                         # estado de los servicios
$C logs -f api whatsapp-bot   # logs en vivo
./infra/scripts/sembrar-demo.sh --reset   # dejar el escenario del demo limpio
```

- Tras cambiar `infra/.env.prod` (por ejemplo, credenciales de Meta): `$C up -d` recrea los contenedores afectados.
- Las imágenes del Dockerfile se validan en cada PR con `.github/workflows/docker.yml`.

### Pendiente de este issue

- **Respaldos diarios de MySQL** con copia fuera de la VPS: issue #36.
- `mysql/permisos-auditoria.sql` **no** vuelve de solo-inserción la tabla `auditoria`: MySQL no permite revocar a nivel de tabla un permiso que el usuario tiene a nivel de base de datos, y Docker otorga `ALL` sobre `salud_digna.*` a `MYSQL_USER`. Para hacerlo efectivo hace falta un usuario de migraciones separado o *triggers* que bloqueen `UPDATE`/`DELETE` (seguimiento de #11).

## Usuario de despliegue, SSH con llave y despliegue automático (#35)

Se hace **una sola vez**, después de que el sitio ya funciona.

1. En **tu computadora** genera una llave si no tienes una: `ssh-keygen -t ed25519` (en Windows, en PowerShell). Copia el contenido de `~/.ssh/id_ed25519.pub`, la llave **pública**.
2. En la VPS, como root:
   ```bash
   cd /opt/salud-digna && git pull
   ./infra/scripts/crear-usuario-despliegue.sh "ssh-ed25519 AAAA... tu-correo"
   ```
   El script crea el usuario `deploy` (con acceso a Docker y sin contraseña), autoriza tu llave para `deploy` y `root`, y genera una llave exclusiva para GitHub Actions. Esa llave **solo puede ejecutar** `desplegar.sh`, por comando forzado en `authorized_keys`.
3. Comprueba desde tu computadora que entras sin contraseña: `ssh deploy@<ip>` y `ssh root@<ip>`.
4. En GitHub → *Settings → Secrets and variables → Actions*, crea `VPS_HOST`, `VPS_USUARIO` (`deploy`) y `VPS_LLAVE_SSH` (salida de `cat /root/llave-despliegue-github`). Luego borra la copia con `shred -u /root/llave-despliegue-github`.
5. Solo después del paso 3: `./infra/scripts/endurecer-ssh.sh`. Desactiva las contraseñas en SSH; root queda solo con llave.

Desde entonces, cada fusión a `main` se despliega sola (workflow *Despliegue a la VPS*). Ya no hace falta el `git pull` manual.
