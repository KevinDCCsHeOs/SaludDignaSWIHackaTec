# ADR 0002: MySQL 8 + Prisma como fuente de verdad

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

Se necesita persistir pacientes, identidades, trámites con estado, eventos, tickets y auditoría con integridad referencial. El equipo ya maneja MySQL y la infraestructura disponible lo soporta.

## Decisión

- **MySQL 8** con `utf8mb4` como única fuente de verdad.
- **Prisma** como ORM y sistema de migraciones (`apps/api/prisma`).
- Columnas `JSON` para el contexto flexible del trámite y el payload de eventos.
- Campos sensibles cifrados a nivel de aplicación (ADR de privacidad en #10).

## Consecuencias

- ✅ Relaciones e integridad fuertes para identidad y trámites.
- ✅ Migraciones versionadas en el repo y tipos generados para TypeScript.
- ⚠️ Los campos cifrados no se pueden filtrar con `WHERE`; se guarda un hash determinista aparte cuando se necesita buscar (ej. CURP).
- ⚠️ Las migraciones son contrato compartido: una por PR.

## Alternativas descartadas

PostgreSQL (igual de válido, pero el equipo y el hosting ya trabajan con MySQL); MongoDB (pierde integridad relacional, clave para identidad unificada).
