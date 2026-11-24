# ADR 0003: Eventos con Redis Streams y patrón outbox

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

La trazabilidad y el tiempo real exigen que cada cambio de estado genere un evento que consuman el timeline, los tableros, las notificaciones y las métricas. No debe existir un cambio sin evento ni un evento sin cambio.

## Decisión

- Cada cambio de estado y su fila en la tabla `Evento` se guardan en **la misma transacción** de MySQL (outbox).
- El `EventBus` publica después en **Redis Streams** (`XADD eventos`).
- Consumidores con **grupos de consumo** (`XREADGROUP`): `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria`.
- Idempotencia por `eventId`; un proceso de reintento republica los eventos pendientes.

## Consecuencias

- ✅ Trazabilidad completa y reconstruible desde MySQL.
- ✅ Redis ya se usa para caché y OTP: no se agrega otra pieza.
- ⚠️ Entrega "al menos una vez": todo consumidor debe tolerar duplicados.
- ⚠️ Redis con AOF activado para no perder mensajes pendientes al reiniciar.

## Alternativas descartadas

Kafka o RabbitMQ (más robustos, pero sobredimensionados para una VPS y un hackathon); eventos solo en memoria (se pierden al reiniciar).
