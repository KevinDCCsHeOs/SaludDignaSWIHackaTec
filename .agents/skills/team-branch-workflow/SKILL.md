---
name: team-branch-workflow
description: >-
  Use this skill when creating branches, syncing with main, resolving merge
  conflicts, or preparing Pull Requests in the Salud Digna omnichannel monorepo
  to prevent branch collisions between fronts (api, whatsapp-bot, web, mobile)
  and broken integrations of the shared contract.
---

# Team Branch Workflow & Conflict Prevention

## 1. Antes de crear una rama

1. Sincroniza `main` sin mezclar trabajo previo:
   `git fetch origin && git checkout main && git merge --ff-only origin/main`
2. Crea una rama corta por issue del tablero SaludDignaKanban: `<tipo>/<NN>-<tema>` (`feat/07-identidad`, `fix/21-otp-expirado`, `docs/41-secuencias`).
3. Si necesitas trabajar en dos issues a la vez sin cambiar de directorio ni arrastrar cambios, usa un worktree aislado (`git worktree add ../sd-<tema> -b <rama> main`).

## 2. Reglas para evitar conflictos en equipo

- **Aislamiento por frente:** edita solo las carpetas de tu frente (`apps/api`, `apps/whatsapp-bot`, `apps/web`, `apps/mobile`, `infra`). Ver la tabla de frentes en `AGENTS.md`.
- **Contrato compartido en PR propio:** `packages/shared/**` (tipos, catálogo de eventos), `apps/api/prisma/schema.prisma` y los `package.json` raíz se cambian en **su propio PR pequeño** y con aviso al equipo antes de continuar.
- **Migraciones de Prisma:** una migración por PR; nunca edites una migración ya fusionada en `main`. Si dos ramas generan migraciones, la segunda en fusionarse se regenera tras actualizar contra `main`.
- **No acumular cambios no relacionados:** cada rama resuelve 1 issue (o un grupo cohesivo de issues ya acordado).
- **Sincronización frecuente:** antes de pedir revisión, actualiza contra `origin/main`:
  `git fetch origin && git rebase origin/main` (o `git merge origin/main` si ya hay revisión compartida).

## 3. Resolución de conflictos preservando intención

1. Identifica los archivos en conflicto con `git status`.
2. Lee **ambas versiones** (`<<<<<<<` vs `>>>>>>>`) entendiendo qué quería lograr cada compañero; nunca uses `--ours` o `--theirs` a ciegas.
3. Combina imports, eventos del catálogo, claves i18n, módulos de NestJS y rutas sin borrar aportes del compañero.
4. Si el conflicto está en `schema.prisma` o en `packages/shared/events`, avisa al dueño del contrato antes de resolver.
5. Ejecuta la verificación completa antes de continuar o subir:
   `npm run lint && npm test && npm run build`
6. Si hiciste `rebase`, sube con `git push --force-with-lease`.

## 4. Checklist previo al Pull Request

- [ ] `git status` sin archivos temporales, `.env`, respaldos `.sql` ni cambios fuera de alcance.
- [ ] Commits atómicos con formato convencional, sin trailers de IA ni co-autores automáticos.
- [ ] `npm run lint`, `npm test` y `npm run build` pasando tras el último commit.
- [ ] Sin datos personales reales ni secretos en código, fixtures o logs.
- [ ] El PR dice `Closes #<NN>` y el issue está en **En revisión**.
- [ ] Si se modificó el contrato compartido o el esquema de Prisma, aviso explícito en el PR.
- [ ] Al hacer merge, eliminar la rama (`git branch -d <rama>` y en GitHub).
