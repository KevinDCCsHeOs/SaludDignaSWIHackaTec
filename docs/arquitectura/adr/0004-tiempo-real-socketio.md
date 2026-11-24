# ADR 0004: Tiempo real con Socket.IO

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

El *Patient Journey* y la consola del asesor deben actualizarse en vivo cuando el paciente avanza en otro canal (objetivo < 2 s).

## Decisión

- Gateway de **Socket.IO** en el módulo `realtime` del API.
- Salas por paciente (`paciente:{id}`) y por rol (`rol:asesor`, `rol:admin`).
- Autenticación del socket con el mismo JWT; el servidor solo emite a quien tiene permiso.
- Nginx configurado con `Upgrade`/`Connection` para WebSocket.

## Consecuencias

- ✅ Reconexión automática y respaldo por long-polling.
- ✅ Escala a varias réplicas con el adaptador de Redis.
- ⚠️ Los clientes deben volver a pedir el estado completo al reconectarse (no depender solo de los mensajes en vivo).

## Alternativas descartadas

Server-Sent Events (solo servidor → cliente, menos soporte en la app); polling (más carga y latencia).
