# Registro de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión importante: contexto, decisión, consecuencias y alternativas descartadas. Para cambiar una decisión, crea un ADR nuevo que la reemplace (no edites uno aceptado).

| ADR | Decisión | Estado |
| --- | --- | --- |
| [0001](0001-monolito-modular-y-monorepo.md) | Monolito modular en NestJS dentro de un monorepo TypeScript | Aceptada |
| [0002](0002-mysql-prisma-fuente-de-verdad.md) | MySQL 8 + Prisma como fuente de verdad | Aceptada |
| [0003](0003-eventos-redis-streams-outbox.md) | Eventos con Redis Streams y patrón outbox | Aceptada |
| [0004](0004-tiempo-real-socketio.md) | Tiempo real con Socket.IO | Aceptada |
| [0005](0005-whatsapp-cloud-api-servicio-separado.md) | WhatsApp Cloud API en un servicio separado | Aceptada |
| [0006](0006-identidad-unificada-con-otp.md) | Identidad unificada por identificadores normalizados + OTP | Aceptada |
| [0007](0007-app-movil-expo.md) | App móvil con Expo / React Native | Aceptada |
| [0008](0008-despliegue-vps-docker-compose.md) | Despliegue en VPS con Docker Compose y Nginx | Aceptada |
| [0009](0009-ia-llm-con-guardrails.md) | Asistente con LLM vía API, guardrails y minimización de datos | Aceptada |

## Plantilla

```markdown
# ADR NNNN: Título

- **Estado:** Propuesta | Aceptada | Reemplazada por NNNN
- **Fecha:** AAAA-MM-DD
- **Issue:** #NN

## Contexto
## Decisión
## Consecuencias
## Alternativas descartadas
```
