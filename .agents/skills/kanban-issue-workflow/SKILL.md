---
name: kanban-issue-workflow
description: >-
  Use this skill when starting, implementing, or closing any issue from the
  SaludDignaKanban board (issues 01 to 42 of SaludDignaSWIHackaTec). It explains
  how to read an issue, respect dependencies, keep the board in sync, and meet
  the shared Definition of Done.
---

# Trabajar un issue de SaludDignaKanban

Tablero: <https://github.com/users/KevinDCCsHeOs/projects/4> · Columnas: Backlog → Por hacer → En progreso → En revisión → Hecho.

## 1. Antes de empezar

1. Lee el issue completo: **Contexto**, **Objetivo**, **Detalle técnico**, **Tareas**, **Criterios de aceptación**, **Fuera de alcance**.
2. Revisa **Depende de**: si un issue previo no está en *Hecho*, coordina con su responsable o trabaja contra su contrato (tipos en `packages/shared`) sin bloquearte.
3. Lee los archivos reales del área (`AGENTS.md` → tabla de frentes) y la arquitectura en `docs/arquitectura/README.md`. No asumas comportamientos.
4. Asígnate el issue y muévelo a **En progreso**.

## 2. Durante el trabajo

- Rama `<tipo>/<NN>-<tema>` desde `main` actualizado (ver skill `team-branch-workflow`).
- Marca en el issue las casillas de **Tareas** conforme avances; si cambia el alcance, edítalo y explica por qué en un comentario.
- Si descubres trabajo nuevo, crea un issue nuevo (mismo formato y etiquetas) en lugar de crecer el actual.
- Respeta las reglas de dominio: datos ficticios (`esDemo: true`), verificar antes de revelar, todo cambio de estado emite evento, la IA nunca diagnostica.

## 3. Para cerrar

1. Comprueba cada **Criterio de aceptación** y márcalo.
2. Cumple la **Definición de terminado**:
   - PR con `Closes #<NN>` revisado por otra persona
   - CI en verde (lint, tipos, pruebas, build)
   - Sin secretos ni datos personales reales
   - Documentación actualizada (README, `docs/`, `.env.example`) si aplica
   - Probado en la VPS cuando aplique
3. Mueve el issue a **En revisión**; al fusionar el PR pasa a **Hecho**.

## 4. Etiquetas

- Épica: `épica: arquitectura`, `identidad-seguridad`, `motor-contexto`, `canales`, `ia`, `roles-tableros`, `adicionales`, `infra-calidad`, `entregables`.
- Prioridad: `P0` (imprescindible para el demo) · `P1` (suma puntos) · `P2` (extra).
- Canal: `canal: web`, `canal: whatsapp`, `canal: app`, `canal: call-center`, y `backend`.
- Prioriza siempre P0 en orden de dependencias antes de tomar P1/P2.
