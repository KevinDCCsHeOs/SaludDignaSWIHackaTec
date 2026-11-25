# Salud Digna Omnicanal — Un paciente, una sola conversación

[![CI](https://github.com/KevinDCCsHeOs/SaludDignaSWIHackaTec/actions/workflows/ci.yml/badge.svg)](https://github.com/KevinDCCsHeOs/SaludDignaSWIHackaTec/actions/workflows/ci.yml)

Prototipo funcional para el track **"Orquestación Omnicanal de Atención: Un paciente, una sola conversación"** de **Salud Digna × TecNM HackaTec** (InnovaTecNM 2026).

## 1. Qué es y qué problema resuelve

Cuando un paciente inicia una cotización en la web y horas después escribe por WhatsApp o llama al Call Center, suele empezar de cero y repetir sus datos. **Salud Digna Omnicanal** unifica **Portal Web, WhatsApp Cloud API, Call Center y App Móvil** sobre un único núcleo transaccional para que el paciente retome su trámite exactamente donde lo dejó, sin perder identidad, contexto ni seguridad.

![Recorrido omnicanal de Ana (Web → WhatsApp → Call Center → App)](docs/arquitectura/diagramas/05-recorrido-ana.svg)

| Pilar | Cómo lo resolvemos | Módulos principales |
| --- | --- | --- |
| **1 · Identidad** | Resolución normalizada (E.164, email, `curp_hash`) y vinculación multicanal solo tras verificar OTP o preguntas de seguridad | `apps/api/src/identidad`, `otp` |
| **2 · Contexto y estado** | Máquina de estados determinista + autoguardado en cada paso persistido en MySQL 8 y cacheado en Redis 7 (TTL 24 h) | `apps/api/src/tramites`, `contexto` |
| **3 · Trazabilidad** | Catálogo de 21 eventos Zod, patrón Outbox (MySQL + Redis Streams), timeline unificado, Patient Journey en vivo (Socket.IO) y KPIs reales | `packages/shared`, `eventos`, `timeline`, `metricas`, `auditoria` |
| **4 · Seguridad y LFPDPPP** | JWT + RBAC (7 roles), cifrado AES-256-GCM en campos sensibles, enmascarado por rol, logs sanitizados, jerarquía clínica de resultados y guardrails IA (911 / no diagnóstico) | `auth`, `privacidad`, `resultados`, `ia` |

---

## 2. Arquitectura y documentación

Todos los canales hablan exclusivamente con `apps/api`; MySQL 8 y Redis 7 permanecen aislados en la red interna.

![Vista de contenedores](docs/arquitectura/diagramas/02-contenedores.svg)

```text
SaludDignaSWIHackaTec/
├── apps/
│   ├── api/            Núcleo NestJS + Prisma: identidad, OTP, trámites, contexto, IA, resultados, KPIs, alertas, facturación
│   ├── whatsapp-bot/   Webhook Meta Cloud API (HMAC-SHA256, cola, deduplicación, es/en/nah, PDF media_id)
│   ├── web/            Next.js 15 App Router: portal paciente, /consola, /journey, /admin (Recharts), /medico, /revisor, /403
│   └── mobile/         App móvil Expo SDK 53 (Android/iOS): 5 pestañas, SecureStore, Push, caché offline, alertas y facturas
├── packages/
│   ├── shared/         Contrato compartido: enums y catálogo de 21 eventos (Zod)
│   ├── ui/             Tokens visuales, metadatos por canal, Timeline y reconexión Socket.IO
│   └── config/         Configuraciones base de TypeScript y ESLint
├── infra/              Docker Compose (dev/prod), Nginx HTTPS, respaldos MySQL, Uptime Kuma y escenarios k6
├── tests/              Pruebas de resiliencia entre canales (3x) y E2E Playwright
└── docs/               Arquitectura, ER, secuencias, eventos, privacidad, normatividad, carga, accesibilidad y guion demo
```

### Índice de documentación técnica

- [Arquitectura de la solución](docs/arquitectura/README.md) · [ADRs](docs/arquitectura/adr/README.md)
- [Modelo de datos (MySQL 8 + Prisma + ER)](docs/modelo-datos/README.md)
- [Diagramas de secuencia y flujo de datos](docs/secuencias-y-flujo-datos.md)
- [Catálogo de eventos omnicanal](docs/eventos.md)
- [Privacidad LFPDPPP](docs/privacidad.md) · [RBAC y credenciales demo](docs/rbac-y-credenciales.md) · [Normatividad y matriz de riesgos](docs/normatividad-riesgos.md)
- [Datos demo](docs/datos-demo.md) · [Glosario "Explícame fácil"](docs/glosario.md) · [Guía Meta WhatsApp](docs/whatsapp-meta.md)
- [Respaldos y monitoreo](docs/operacion-respaldos.md) · [Escalabilidad y carga (k6)](docs/escalabilidad-y-carga.md) · [Accesibilidad WCAG y Lighthouse](docs/accesibilidad-rendimiento.md)
- [Guion del demo final (8 min)](docs/guion-demo-final.md) · [Checklist imprimible día del demo](docs/checklist-demo.md)

---

## 3. Requisitos previos

- **Node.js >= 22** y **npm >= 10**
- **Docker** y **Docker Compose** (para MySQL 8.4 con `utf8mb4` y Redis 7 con AOF)
- *(Opcional móvil)* **Expo Go** en Android/iOS o cuenta EAS para generar el APK (`apps/mobile/eas.json`)

---

## 4. Instalación local en 5 comandos

```bash
# 1. Clonar e instalar dependencias del monorepo
npm install

# 2. Levantar MySQL 8 y Redis 7 locales
docker compose -f infra/docker-compose.dev.yml up -d

# 3. Copiar variables de entorno de ejemplo (nunca subir archivos .env reales)
cp apps/api/.env.example apps/api/.env && cp apps/whatsapp-bot/.env.example apps/whatsapp-bot/.env && cp apps/web/.env.example apps/web/.env

# 4. Aplicar migraciones Prisma, generar cliente y cargar datos ficticios del demo
npm run prisma:migrate:deploy && npm run prisma:generate && npm run seed

# 5. Iniciar API (:3000), WhatsApp Bot (:3001) y Web (:3002) en paralelo
npm run dev
```

Al terminar, abre <http://localhost:3002> (Web), <http://localhost:3000/health> (API) y <http://localhost:3001/health> (Bot).

---

## 5. Variables de entorno

| Variable | Servicio(s) | Obligatoria | Descripción |
| --- | --- | :---: | --- |
| `DATABASE_URL` | `api` | Prod | Cadena MySQL 8 con `?charset=utf8mb4` (sin ella el API opera en modo memoria/pruebas) |
| `REDIS_URL` | `api` | Prod | Conexión Redis 7 (`redis://localhost:6379`) para Streams, OTP, caché y tokens push |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `api` | Prod | Secretos de firma JWT (generar con `openssl rand -hex 32`) |
| `API_SERVICE_TOKEN` | `api`, `whatsapp-bot` | Prod | Token interno para autenticación servicio-a-servicio (`rol: asesor_ia`) |
| `ENCRYPTION_KEY` / `CURP_HASH_PEPPER` | `api` | Prod | Llave hexadecimal de 32 bytes para AES-256-GCM y *pepper* de `curp_hash` |
| `WA_VERIFY_TOKEN` / `WA_APP_SECRET` | `whatsapp-bot` | Prod | Token de handshake y secreto HMAC-SHA256 de Meta Developers |
| `WA_ACCESS_TOKEN` / `WA_PHONE_NUMBER_ID` | `whatsapp-bot`, `api` | Prod | Credenciales Graph API v21.0 para envío de mensajes, OTP y documentos PDF |
| `DEMO_TELEFONO_PACIENTE` | `api` | Opcional | Celular del presentador asignado a Ana ficticia para pruebas en WhatsApp real |
| `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` | `api` | Opcional | Proveedor LLM (`none`, `gemini`, `openai`, `anthropic`); con `none` opera el motor NLP local (96% eval) |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` | `web` | Sí | URLs públicas del API REST y Socket.IO (`http://localhost:3000` en local) |
| `EXPO_PUBLIC_API_URL` | `mobile` | Sí | URL del API consumida por la app móvil Expo |
| `BACKUP_REMOTO_DESTINO` / `ALERTA_WEBHOOK_URL` | `infra` | Opcional | Destino `rsync` externo y webhook Discord/Telegram para alertas de respaldo (#36) |

Para despliegue en VPS con Docker Compose + Nginx HTTPS + Certbot, consulta [`infra/README.md`](infra/README.md).

---

## 6. Credenciales de prueba por rol (`esDemo: true`)

> **Todos los registros son 100% ficticios** (`@demo.saluddigna.local`). En `/login` también existen botones de acceso rápido para cada rol.

| Rol | Correo electrónico | Contraseña demo | Ruta de inicio | Qué puede hacer |
| --- | --- | --- | --- | --- |
| **`paciente`** | `ana.lopez@demo.saluddigna.local` | `DemoPaciente2026!` | `/` | Cotizar, autoguardar, ver trámites/citas, descargar resultados liberados y facturas |
| **`asesor`** | `asesor.puebla@demo.saluddigna.local` | `DemoAsesor2026!` | `/consola` | Buscar pacientes (datos enmascarados), verificar Call Center, cola de tickets, llamadas y `/journey` |
| **`asesor_pro`** | `asesor.pro@demo.saluddigna.local` | `DemoAsesorPro2026!` | `/consola` | Segundo nivel de escalamiento, fusión de duplicados (`merge`), `/journey` y KPIs |
| **`medico`** | `medico.puebla@demo.saluddigna.local` | `DemoMedico2026!` | `/medico` | Validar médicamente, liberar resultados (PDF + notificación) y mensajería con paciente |
| **`revisor_tecnico`** | `revisor.lab@demo.saluddigna.local` | `DemoRevisor2026!` | `/revisor` | Revisar y aprobar/rechazar estudios en etapa `captura → revision_tecnica` |
| **`admin`** | `admin@demo.saluddigna.local` | `DemoAdmin2026!` | `/admin` | Dashboard de KPIs (Recharts + CSV), Patient Journey, estatus de clínicas, alertas y auditoría |

---

## 7. Cómo replicar el demo paso a paso

1. **Reiniciar datos limpios:** ejecuta `npm run demo:reset` (en VPS: `./infra/scripts/sembrar-demo.sh --reset`).
2. **Abrir Patient Journey en paralelo:** inicia sesión como `admin` en una ventana y abre `/journey/pac_ana_demo` en **Modo presentación**.
3. **Paso 1 — Web (Ana):** en otra ventana entra en `/login` como **Ana (Paciente)** → ve a `/cotizar` → selecciona *Ultrasonido abdominal* (prueba el botón **"Explícame fácil"**) → elige *Salud Digna Puebla Centro* → observa el aviso de autoguardado y **cierra la pestaña sin confirmar**.
4. **Paso 2 — WhatsApp (Ana):** escribe `"Hola"` al bot de WhatsApp → ingresa el código **OTP de 6 dígitos** recibido → el bot reconoce su trámite pendiente sin pedir datos repetidos → elige **"Sí, continuar"** y **"Mañana 9:00"** (`cita_agendada`). *(Opcional: escribe `"Quiero mi factura"` para recibir el PDF simulado).*
5. **Paso 3 — Call Center (Carlos):** entra en `/consola` como **Carlos (Asesor)** → presiona `Alt+B` y busca `2221234567` → verifica identidad por preguntas → registra llamada (`Alt+L`) y pulsa **Confirmar cita** (`cita_confirmada`).
6. **Paso 4 — App Móvil y KPIs:** abre la App Expo como Ana para ver la cita confirmada, timeline completo y alertas preventivas; revisa en `/admin` los KPIs calculados sobre los eventos recién generados.

Para el guion cronometrado de 8 minutos y el plan de contingencia ante el jurado, consulta [`docs/guion-demo-final.md`](docs/guion-demo-final.md) y [`docs/checklist-demo.md`](docs/checklist-demo.md).

---

## 8. Enlaces del despliegue y pruebas

| Recurso | Ruta / Comando |
| --- | --- |
| **Portal Web (producción VPS)** | `https://app.<DOMINIO>` (local: `http://localhost:3002`) |
| **Consola de Call Center** | `https://app.<DOMINIO>/consola` |
| **Tablero Patient Journey en vivo** | `https://app.<DOMINIO>/journey/pac_ana_demo` |
| **Dashboard Admin KPIs** | `https://app.<DOMINIO>/admin` |
| **Núcleo API + Socket.IO** | `https://api.<DOMINIO>/health` (local: `http://localhost:3000/health`) |
| **Webhook WhatsApp Cloud API** | `https://wa.<DOMINIO>/webhook` (configuración del número de prueba en [`docs/whatsapp-meta.md`](docs/whatsapp-meta.md)) |
| **App Móvil Android (APK)** | Compilable con `cd apps/mobile && npx eas build --platform android --profile preview` (`apps/mobile/eas.json`) o pruebas instantáneas con `npx expo start` |

### Scripts útiles de verificación y calidad

| Comando | Qué verifica |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint y compilación estricta TypeScript en los 6 workspaces |
| `npm test` | Build completo (incluyendo `next build`) y todas las suites unitarias/integración |
| `npm run eval:ia` | Evalúa el clasificador NLP contra las 50 frases etiquetadas (precisión actual: **96%**) |
| `npm run test:resiliencia:3x` | Ejecuta los 6 escenarios de resiliencia entre canales 3 veces seguidas sin fallos |
| `npm run bench:carga` | Benchmark de 200 VU contexto, 300 webhooks firmados y 300 sockets Socket.IO |

---

## 9. Equipo y licencia

- **Proyecto:** Salud Digna Omnicanal — HackaTec / InnovaTecNM 2026
- **Tablero de seguimiento:** **SaludDignaKanban** (<https://github.com/users/KevinDCCsHeOs/projects/4>, issues `01.` a `42.`)
- **Licencia:** Uso académico y demostrativo para el reto Salud Digna × TecNM HackaTec 2026 (sin uso de datos reales ni timbrado/certificación clínica).
