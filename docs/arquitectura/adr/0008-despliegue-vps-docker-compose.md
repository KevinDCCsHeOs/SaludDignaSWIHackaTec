# ADR 0008: Despliegue en VPS con Docker Compose y Nginx

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

Se contrató una VPS Hostinger KVM 2 (2 vCPU, 8 GB RAM). El demo necesita HTTPS público (webhook de Meta), WebSockets y procesos siempre encendidos.

## Decisión

- Todos los servicios en **Docker Compose**: `nginx`, `web`, `api`, `whatsapp-bot`, `mysql`, `redis`, `backup`.
- **Nginx** como único punto expuesto con TLS de Let's Encrypt y subdominios `app.`, `api.`, `wa.`.
- MySQL y Redis solo en la red interna.
- Despliegue automático desde `main` con GitHub Actions por SSH; respaldos diarios con copia externa.

## Consecuencias

- ✅ Entorno reproducible: el mismo `compose` en local y en la VPS.
- ✅ Costo bajo y control total.
- ⚠️ Un solo servidor = punto único de falla; se mitiga con respaldos, healthchecks y plan B del demo.
- ⚠️ La administración del servidor (actualizaciones, firewall) es responsabilidad del equipo.

## Alternativas descartadas

Hosting compartido cPanel (sin procesos persistentes ni WebSockets fiables); PaaS como Railway (válido, pero ya se cuenta con la VPS).
