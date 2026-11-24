# Salud Digna Omnicanal — Un paciente, una sola conversación

Prototipo para el track **"Orquestación Omnicanal de Atención"** de **Salud Digna × TecNM HackaTec** (InnovaTecNM 2026).

El paciente puede iniciar un trámite en la **web**, continuarlo por **WhatsApp**, resolver una duda con el **Call Center** y ver su cita confirmada en la **app**, sin repetir datos ni empezar de cero.

![Vista de contenedores](docs/arquitectura/diagramas/02-contenedores.svg)

## Los cuatro pilares

| Pilar | Cómo lo resolvemos |
| --- | --- |
| **Identidad** | Un paciente, muchas identidades de canal (teléfono, email, app), vinculadas solo tras verificar con OTP |
| **Contexto y estado** | Máquina de estados del trámite y contexto autoguardado en cada paso |
| **Trazabilidad** | Catálogo de eventos, línea de tiempo unificada y bitácora de auditoría |
| **Seguridad** | JWT + roles, OTP, cifrado de datos sensibles, enmascarado y cumplimiento de la LFPDPPP |

## Estructura del repositorio

```text
apps/
├── api/            Núcleo NestJS: identidad, trámites, contexto, eventos, tickets, IA
├── whatsapp-bot/   Webhook de WhatsApp Cloud API y diálogo
├── web/            Next.js: portal paciente, consola asesor, Patient Journey, KPIs
└── mobile/         Expo: app Android/iOS
packages/shared/    Tipos y catálogo de eventos (contrato común)
infra/              Docker Compose, Nginx y respaldos para la VPS
docs/               Arquitectura, ADRs y diagramas
```

> Las carpetas de `apps/`, `packages/` e `infra/` se crean en los issues #4 y #35.

## Documentación

- [Arquitectura de la solución](docs/arquitectura/README.md)
- [Decisiones de arquitectura (ADR)](docs/arquitectura/adr/README.md)
- [Cómo trabajamos](CONTRIBUTING.md) · [Guía para agentes y desarrollo](AGENTS.md)

## Tablero

Las tareas están en **SaludDignaKanban**: <https://github.com/users/KevinDCCsHeOs/projects/4> (issues `01.` a `42.`).

## Instalación, credenciales de prueba y demo

Se documentarán en el issue #40 cuando el código base esté listo.
