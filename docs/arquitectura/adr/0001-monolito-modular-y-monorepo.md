# ADR 0001: Monolito modular en NestJS dentro de un monorepo TypeScript

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

El reto pide una arquitectura sólida, escalable y demostrable, pero el equipo es pequeño y el tiempo es de hackathon. Hay cuatro piezas (API, bot, web y app) que comparten tipos y el catálogo de eventos.

## Decisión

- Un **monorepo** con `apps/api`, `apps/whatsapp-bot`, `apps/web`, `apps/mobile` y `packages/shared`, todo en TypeScript.
- El núcleo es un **monolito modular** en NestJS: un solo despliegue, con módulos de límites claros (`identidad`, `tramites`, `contexto`, `eventos`, …) que solo se comunican por servicios públicos y eventos.
- El bot de WhatsApp va aparte (ver ADR 0005) porque tiene requisitos de disponibilidad y ritmo de cambio distintos.

## Consecuencias

- ✅ Un solo lenguaje y tipos compartidos: menos errores de integración entre canales.
- ✅ Despliegue y depuración sencillos para el demo.
- ✅ Los módulos se pueden extraer a servicios después sin rediseñar.
- ⚠️ Un error grave en el API afecta a todos los canales → healthchecks y reinicio automático (#36).
- ⚠️ Requiere disciplina: prohibido que un módulo use tablas de otro directamente.

## Alternativas descartadas

Microservicios por dominio (demasiadas piezas para el tiempo disponible); backend en Python/FastAPI (rompe el contrato de tipos compartido con web y app).
