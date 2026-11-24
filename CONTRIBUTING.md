# Cómo trabajamos

1. Toma un issue del tablero **SaludDignaKanban**, asígnatelo y muévelo a **En progreso**. Revisa antes su sección *Depende de*.
2. Crea una rama desde `main` con el número del issue: `git switch -c feat/07-identidad`.
3. Haz commits pequeños con formato convencional: `feat(api): resolución de identidad (#7)`.
4. Antes de subir, corre `npm run lint`, `npm test` y `npm run build`: si algo falla, no se sube.
5. Abre un pull request hacia `main` que diga `Closes #<número>`, mueve el issue a **En revisión** y pide revisión a una persona.
6. Nadie hace push directo a `main`: lo que entra a `main` se despliega a la VPS.

Reglas:

- `packages/shared/` (tipos y eventos) y `apps/api/prisma/schema.prisma` son el contrato de todos. Cambiarlos = pull request propio y avisar en el chat del equipo.
- Toca solo las carpetas de tu frente; si necesitas algo de otro, pídelo en su issue.
- Los canales nunca escriben directo en la base de datos: todo pasa por el API y emite su evento.
- Datos siempre ficticios. Un registro de demo lleva `"esDemo": true`. Nunca datos reales de pacientes.
- Ningún secreto en el repo: tokens de Meta, llaves del LLM y contraseñas van en `.env` (solo se sube `.env.example`).
- Textos para el paciente en los archivos de i18n, nunca escritos en el código.
- Un issue está terminado cuando cumple su **Definición de terminado** y sus criterios de aceptación.
