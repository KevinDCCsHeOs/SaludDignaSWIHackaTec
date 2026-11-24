# Matriz de Permisos (RBAC) y Credenciales de Prueba

> Issue: **06. [ID] Autenticación y roles (RBAC)** (#6) · Listado de referencia para #29 y #40.
>
> **Todos los usuarios listados son 100% ficticios (`esDemo: true`).** Nunca usar datos reales ni reutilizar estas contraseñas en producción.

## 1. Política de sesiones y seguridad

- **Access token (JWT):** vigencia de **15 minutos**, enviado por cabecera `Authorization: Bearer <token>`.
- **Refresh token (JWT con `jti`):** vigencia de **7 días**, rotado en cada `POST /auth/refresh`, enviado como cookie `httpOnly` (`sd_refresh_token`) en web o en almacenamiento seguro (`SecureStore`) en la app móvil.
- **Contraseñas:** almacenadas únicamente con `bcrypt` (jamás retornadas por el API ni escritas en logs).
- **Rate limit en login:** bloqueo temporal de **15 minutos** tras **5 intentos fallidos** por `(ip, email)` (`HTTP 429`).
- **Servicio interno (`apps/whatsapp-bot`):** se autentica mediante `x-service-token` bajo el rol `asesor_ia`. Para leer o modificar trámites, contexto, timeline o tickets de un paciente necesita además una **sesión OTP vigente** de ese paciente en el canal del header `x-canal` (por defecto `whatsapp`); sin ella recibe `403`.

## 2. Matriz de permisos por rol

Fuente en código: [`apps/api/src/auth/permisos.ts`](../apps/api/src/auth/permisos.ts).

| Recurso / Permiso | `paciente` | `asesor_ia` | `asesor` | `asesor_pro` | `medico` | `revisor_tecnico` | `admin` |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Propio trámite (`leer` / `editar`) | ✅ / ✅ | — | — | — | — | — | 👁️ / — |
| Trámites de otros (`leer` / `editar`) | — | — | 👁️ / ✏️ | 👁️ / ✏️ | 👁️ (asignados) | 👁️ | 👁️ / — |
| Tickets escalados (`leer` / `gestionar`) | — | — | — | 👁️ / ✏️ | — | — | 👁️ / — |
| Revisar resultados (`resultado:revisar`) | — | — | — | — | — | ✅ | — |
| Liberar resultados (`resultado:liberar`) | — | — | — | — | ✅ | — | — |
| Auditoría y KPIs (`auditoria:leer`, `kpis:leer`) | — | — | — | — | — | — | ✅ |
| Resolver / vincular identidad | — | ✅ | ✅ | ✅ | — | — | ✅ |
| Merge controlado de duplicados | — | — | — | ✅ | — | — | ✅ |
| Verificación Call Center (preguntas) | — | — | ✅ | ✅ | — | — | ✅ |
| Asistir recuperación (solo dispara enlace) | — | — | ✅ | ✅ | — | — | ✅ |

## 3. Credenciales de prueba demo (para #17 y #40)

| Rol | Correo | Contraseña demo | Región | Paciente vinculado |
| --- | --- | --- | --- | --- |
| `paciente` | `ana.lopez@demo.saluddigna.local` | `DemoPaciente2026!` | Puebla | `pac_ana_demo` |
| `asesor_ia` | `ia.bot@demo.saluddigna.local` | `DemoIaSistema2026!` | — | — |
| `asesor` | `asesor.puebla@demo.saluddigna.local` | `DemoAsesor2026!` | Puebla | — |
| `asesor_pro` | `asesor.pro@demo.saluddigna.local` | `DemoAsesorPro2026!` | Puebla | — |
| `asesor` | `asesor2.puebla@demo.saluddigna.local` | `DemoAsesor2026!` | Puebla | — |
| `asesor` | `asesor.cdmx@demo.saluddigna.local` | `DemoAsesor2026!` | CDMX | — |
| `asesor_pro` | `asesor.pro.cdmx@demo.saluddigna.local` | `DemoAsesorPro2026!` | CDMX | — |
| `asesor` | `asesor.mty@demo.saluddigna.local` | `DemoAsesor2026!` | Monterrey | — |
| `asesor_pro` | `asesor.pro.mty@demo.saluddigna.local` | `DemoAsesorPro2026!` | Monterrey | — |
| `medico` | `medico.puebla@demo.saluddigna.local` | `DemoMedico2026!` | Puebla | — |
| `revisor_tecnico` | `revisor.lab@demo.saluddigna.local` | `DemoRevisor2026!` | Puebla | — |
| `admin` | `admin@demo.saluddigna.local` | `DemoAdmin2026!` | — | — |
