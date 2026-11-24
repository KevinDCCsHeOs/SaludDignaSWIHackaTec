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

## Producción (`docker-compose.prod.yml` y `nginx/`)

La configuración de producción para la VPS Hostinger KVM 2 (`app.`, `api.`, `wa.`, TLS con Let's Encrypt, WebSockets y respaldos) se completa en el issue **#35**.
