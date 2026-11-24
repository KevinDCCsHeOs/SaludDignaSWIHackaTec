# Salud Digna Omnicanal — Guía para Agentes y Desarrollo (AGENTS.md)

Responde en español. Sé crítico y realista: no le des la razón al usuario si no la tiene; señala riesgos técnicos, de seguridad o de diseño y recomienda lo mejor para el proyecto y para el demo.

## 1. Qué es el proyecto

Prototipo para el track **"Orquestación Omnicanal de Atención: Un paciente, una sola conversación"** de **Salud Digna × TecNM HackaTec** (InnovaTecNM 2026).

Objetivo: conectar los canales de atención de Salud Digna (**Web, App, WhatsApp y Call Center**) para que el paciente inicie un trámite en un canal y lo retome en otro **sin perder su identidad, sus datos ni su avance**. No es un "buzón unificado de mensajes": la solución debe resolver cuatro pilares.

| Pilar | Qué exige | Dónde se resuelve |
| --- | --- | --- |
| 1 · Identidad | Unificar al paciente entre canales | `apps/api/src/identidad` (#7, #8) |
| 2 · Contexto y estado | Guardar el avance real del trámite | `apps/api/src/tramites`, `contexto` (#12, #13) |
| 3 · Trazabilidad | Saber qué pasó, cuándo y dónde | `apps/api/src/eventos`, `auditoria` (#3, #11, #14, #15) |
| 4 · Seguridad | Autenticación, privacidad y protección de datos | `apps/api/src/auth`, `privacidad` (#6, #8, #10) |

La arquitectura completa está en [`docs/arquitectura/README.md`](docs/arquitectura/README.md). Léela antes de proponer cambios estructurales.

## 2. Arquitectura y Frentes de Trabajo

Monorepo TypeScript. Todos los canales hablan con un único API; ningún canal accede directo a la base de datos.

| Carpeta | Frente | Responsabilidad |
| --- | --- | --- |
| `apps/api/` | 1 · Núcleo | API NestJS: identidad, OTP, trámites, contexto, eventos, timeline, tickets, auditoría, tiempo real (Socket.IO) |
| `apps/whatsapp-bot/`, `apps/api/src/ia/` | 2 · WhatsApp e IA | Webhook de WhatsApp Cloud API, diálogo, asistente virtual y escalamiento |
| `apps/web/` | 3 · Web | Next.js: portal del paciente, consola del asesor, vista médica, Patient Journey y KPIs |
| `apps/mobile/` | 4 · App | Expo (Android/iOS): trámites, citas, resultados y notificaciones push |
| `packages/shared/` | Contrato compartido | Tipos, catálogo de eventos (zod), enums y validaciones usados por todos |
| `infra/`, `.github/`, `docs/` | 5 · Infra, calidad y docs | Docker Compose, Nginx, respaldos, CI/CD, pruebas e2e y documentación |

### Reglas de arquitectura e ingeniería

- **Un solo API como fuente de verdad**: web, app, bot y consola leen y escriben **solo** a través de `apps/api`. MySQL y Redis nunca se exponen a los canales ni a internet.
- **Todo cambio de estado emite un evento**: cada transición de trámite, verificación de identidad, ticket o cambio de canal publica un evento del catálogo (`packages/shared/events`). Sin evento no hay trazabilidad ni actualización en tiempo real.
- **Contrato compartido**: `packages/shared/` y `apps/api/prisma/schema.prisma` son el contrato entre frentes. Cualquier cambio requiere **su propio Pull Request** y aviso previo al equipo.
- **Aislamiento por frente**: modifica únicamente las carpetas de tu frente. Si necesitas algo de otro frente, pídelo en su issue o abre un PR dedicado.
- **Contexto antes que formularios**: si el sistema ya conoce un dato del paciente, ningún canal debe volver a pedirlo. Guardar el avance en cada paso (autoguardado), no solo al "Confirmar".
- **Verificar antes de revelar**: ningún canal muestra datos del trámite hasta que la identidad esté verificada (OTP o preguntas de seguridad en Call Center).
- **Privacidad por diseño (LFPDPPP)**: los datos de salud son datos personales sensibles. Cifrar campos sensibles, enmascararlos según rol, no escribirlos en logs y registrar el consentimiento.
- **Datos ficticios siempre**: nunca usar datos reales de pacientes. Todo registro de demo lleva `"esDemo": true` y nombres inventados.
- **IA con límites**: el asistente clasifica intenciones y responde con el contexto del paciente, pero **nunca diagnostica, receta ni interpreta resultados**. Ante síntomas de alarma, deriva a 911 y escala a un humano.
- **Resiliencia del demo**: el webhook de WhatsApp responde `200` de inmediato y procesa en cola; los eventos son idempotentes (`eventId`); el contexto sobrevive reinicios del servidor.
- **Textos del paciente fuera del código**: los textos visibles para el paciente (web, app y bot) van en archivos de i18n (`es` obligatorio, `en` deseable), no escritos directamente en componentes.
- **Auditar el código antes de planear o editar**: leer los archivos reales implicados (módulos, esquemas, eventos) sin asumir comportamientos.

## 3. Buenas Prácticas de Git y Repositorio

### Flujo de ramas (Branching)

- `main` está siempre estable y desplegable. El despliegue a la VPS sale de `main` (#35).
- **Prohibido hacer push directo a `main`**: todo cambio entra por Pull Request con al menos una revisión.
- Una rama por issue. Nomenclatura: `<tipo>/<NN>-<tema-corto>` usando el número del issue del tablero **SaludDignaKanban** (ej. `feat/07-identidad`, `fix/21-otp-expirado`, `docs/01-arquitectura`).
- El PR debe decir `Closes #<número>` y, al subir avances, comenta en el issue etiquetando al responsable.

### Commits limpios y atómicos

- Commits pequeños, atómicos y enfocados en un solo cambio lógico.
- Formato convencional en español: `feat(api): resolución de identidad (#7)`, `fix(bot): …`, `docs: …`, `chore: …`.
- **Sin etiquetas de IA ni co-autores automáticos**: no incluyas trailers `Co-Authored-By:` de asistentes ni menciones de herramientas generativas en los mensajes de commit.
- **Verificación previa**: cuando existan los scripts, ejecuta `npm run lint`, `npm test` y `npm run build` antes de hacer push. Si algo falla, no se sube.

### Higiene del repositorio

- Nunca subas `node_modules/`, builds, archivos `.env*` (salvo `.env.example`), respaldos de base de datos, llaves, tokens de Meta o del LLM.
- Mantén dependencias mínimas y justificadas en cada `package.json`.

## 4. Reto y Reglas de Dominio

### Recorrido de referencia (caso de uso del demo)

1. **Web**: Ana cotiza un ultrasonido y elige clínica, pero cierra la computadora antes de confirmar.
2. **WhatsApp**: horas después escribe; el sistema valida su identidad, reconoce el trámite pendiente y le ofrece continuar.
3. **Call Center**: el asesor ve el contexto acumulado (estudio, clínica, pasos) y concluye la atención sin pedirle repetir datos.
4. **App**: Ana abre la aplicación y ve su cita agendada y confirmada.

El demo final debe iniciar en un canal, continuar en un segundo y concluir en un tercero, soportando interrupciones, información parcial y recuperación de procesos pendientes.

### Usuarios y roles

| Rol | Quién es | Ve / hace |
| --- | --- | --- |
| `paciente` | Adultos, adultos con hijos o con padres a su cargo | Sus trámites, citas, resultados, tickets |
| `asesor_ia` | Asistente virtual (sistema) | Primer nivel de atención en WhatsApp y web |
| `asesor` / `asesor_pro` | Contact Center (asesores reales y de segundo nivel) | Contexto y timeline del paciente, tickets escalados |
| `medico` | Médicos | Pacientes asignados, validación de resultados |
| `revisor_tecnico` | Revisores técnicos | Revisión de estudios antes de validación médica |
| `admin` | Administradores | Monitoreo, Patient Journey, KPIs, auditoría |

### Problemas del usuario que el sistema debe atender

Información incompleta o incorrecta · No tengo acceso a mi cuenta · No sé a dónde ir (clínica/dirección) · Idioma y comprensión (inglés, náhuatl, términos médicos) · Seguridad y registro · Errores en el servicio · Situaciones críticas o vigencias.

### Consideraciones del sector

- Normas: NOM-024-SSA3 y NOM-004-SSA3 (oficiales); ISO/IEC 27001 e ISO 9001 (opcionales).
- Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
- Flujo del servicio: cotización → registro → cita → pago/factura → proceso → resultados.
- Jerarquía de liberación de resultados: captura → revisión técnica → validación médica → liberación.

## 5. Stack y Alcance

- **Stack**: TypeScript · NestJS (API) · Next.js (web) · Expo/React Native (app) · WhatsApp Business Platform (Cloud API) · MySQL 8 + Prisma · Redis (Streams, caché, OTP) · Socket.IO · Docker Compose + Nginx en VPS Hostinger KVM 2.
- **Subdominios**: `app.` (web), `api.` (API y WebSockets), `wa.` (webhook de WhatsApp).
- **Mínimo viable (MVP)**: identidad unificada con OTP, trámite con estado y contexto persistente, timeline unificado, 3 canales funcionando (Web → WhatsApp → Call Center/App), vistas por rol y tablero Patient Journey en tiempo real.
- **Fuera de alcance**: telefonía real (VoIP), timbrado CFDI ante el SAT, integración con sistemas internos de Salud Digna, publicación en tiendas de apps, microservicios separados por dominio, diagnóstico médico por IA.

## 6. Tablero y Fuentes

- Tablero: **SaludDignaKanban** — <https://github.com/users/KevinDCCsHeOs/projects/4> (issues `01.` a `42.`; cada uno trae contexto, detalle técnico, criterios de aceptación y dependencias).
- Reto: `Reto_Software_Inteligente_-_SALUD_DIGNA.pdf` (Salud Digna × TecNM HackaTec).
- WhatsApp Cloud API: <https://developers.facebook.com/docs/whatsapp/cloud-api>
- LFPDPPP: <https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf>
