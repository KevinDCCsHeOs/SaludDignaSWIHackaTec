# Configuración de Nginx

Aquí vivirán los bloques `server` de Nginx para la VPS (#35):

- `app.<dominio>` → `apps/web` (puerto interno `3002`)
- `api.<dominio>` → `apps/api` (puerto interno `3000`, con `Upgrade` / `Connection` para Socket.IO)
- `wa.<dominio>/webhook` → `apps/whatsapp-bot` (puerto interno `3001`)

TLS obligatorio con Let's Encrypt y rate limiting en login, OTP y webhook.
