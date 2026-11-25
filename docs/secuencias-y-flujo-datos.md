# Diagramas de Secuencia y Flujo de Datos — Salud Digna Omnicanal

> Issue: **41. [DOC] Diagramas de secuencia y flujo de datos** (#41) · Entregable obligatorio.
>
> Todos los diagramas reflejan los endpoints reales de `apps/api`, `apps/whatsapp-bot`, `apps/web` y `apps/mobile`, así como el esquema Prisma de [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) y el catálogo de eventos de [`docs/eventos.md`](eventos.md).

---

## 1. Secuencia: Web → WhatsApp (identidad, OTP y recuperación de contexto)

Fuente Mermaid: [`secuencias/diagramas/01-web-a-whatsapp.mmd`](secuencias/diagramas/01-web-a-whatsapp.mmd).

```mermaid
sequenceDiagram
  autonumber
  actor Ana as Ana (Web / WhatsApp)
  participant Web as Portal Web (Next.js)
  participant Bot as WhatsApp Bot (Cloud API)
  participant API as Núcleo API (NestJS)
  participant Redis as Redis 7 (OTP / ctx / Streams)
  participant DB as MySQL 8 (Prisma)
  participant RT as Socket.IO (/journey)

  Note over Ana,Web: Etapa 1 — Inicio en Portal Web y cierre abrupto
  Ana->>Web: Selecciona "Ultrasonido abdominal"
  Web->>API: POST /tramites (JWT paciente, canal=web)
  API->>DB: INSERT tramites (estado=cotizacion) + eventos (outbox)
  API->>Redis: SET ctx:pac_ana_demo (TTL 24h) + XADD eventos
  API-->>RT: evento:omnicanal (cotizacion.iniciada)

  Ana->>Web: Elige clínica "Puebla Centro"
  Web->>API: PATCH /tramites/:id/contexto (autoguardado)
  API->>DB: UPDATE tramites (estado=seleccion_clinica, contexto JSON)
  API->>Redis: SET ctx:pac_ana_demo + XADD eventos (clinica.seleccionada)
  API-->>RT: evento:omnicanal (clinica.seleccionada)
  Note over Ana,Web: Ana cierra la pestaña antes de confirmar cita

  Note over Ana,Bot: Etapa 2 — Horas después en WhatsApp (Verificar antes de revelar)
  Ana->>Bot: "Hola" (webhook Meta firmado X-Hub-Signature-256)
  Bot-->>Ana: HTTP 200 OK inmediato + encolado (dedup por message.id)
  Bot->>API: POST /identidad/resolver (x-service-token, canal=whatsapp)
  API->>DB: Buscar identidades_canal y pacientes.telefono_e164 (+52...)
  API-->>Bot: { estado: "requiere_verificacion", pacienteId: "pac_ana_demo" }

  Bot->>API: POST /otp/solicitar (pacienteId, canal=whatsapp)
  API->>Redis: SET otp:pac_ana_demo (SHA-256 hash, TTL 5 min)
  API-->>Ana: Envía código OTP de 6 dígitos por WhatsApp

  Ana->>Bot: "482913"
  Bot->>API: POST /otp/verificar (pacienteId, canal=whatsapp, codigo)
  API->>Redis: Compara hash + SET otp:verificado:pac_ana_demo:whatsapp (TTL 30 min)
  API->>DB: INSERT auditoria (verificar_otp) + eventos (identidad.verificada)
  API-->>Bot: { verificado: true }

  Bot->>API: POST /identidad/vincular (tras OTP verificado)
  API->>DB: UPSERT identidades_canal (verificado_en=NOW)
  Bot->>API: GET /pacientes/pac_ana_demo/contexto (x-canal=whatsapp)
  API->>Redis: GET ctx:pac_ana_demo (fallback MySQL si expira)
  API-->>Bot: { folio, estudio: "Ultrasonido abdominal", clinica: "Puebla Centro" }
  Bot-->>Ana: "¡Gracias, Ana! Tienes pendiente Ultrasonido abdominal en Puebla Centro. ¿Continuamos?"

  Ana->>Bot: "Sí, continuar" → "Mañana 9:00"
  Bot->>API: POST /tramites/:id/avanzar (estadoDestino=cita_agendada, canal=whatsapp)
  API->>DB: UPDATE tramites + INSERT citas + eventos (canal.cambiado, cita.agendada)
  API->>Redis: SET ctx:pac_ana_demo + XADD eventos
  API-->>RT: evento:omnicanal (canal.cambiado + cita.agendada)
  Bot-->>Ana: "Cita agendada con código SDXXXXXX (sin repetir datos)"
```

---

## 2. Secuencia: WhatsApp → Call Center → App Móvil

Fuente Mermaid: [`secuencias/diagramas/02-whatsapp-callcenter-app.mmd`](secuencias/diagramas/02-whatsapp-callcenter-app.mmd).

```mermaid
sequenceDiagram
  autonumber
  actor Ana as Ana (Teléfono / App Móvil)
  actor Carlos as Carlos (Asesor Call Center)
  participant Consola as Consola Web (/consola)
  participant API as Núcleo API (NestJS)
  participant DB as MySQL 8
  participant Redis as Redis 7
  participant Push as Expo Push Service
  participant App as App Móvil (Expo)
  participant Journey as Patient Journey (/journey)

  Note over Ana,Consola: Etapa 3 — Call Center (contexto completo, datos enmascarados)
  Ana->>Carlos: Llama con duda de preparación y para confirmar cita
  Carlos->>Consola: Busca por teléfono/nombre/folio (Alt+B)
  Consola->>API: GET /identidad/pacientes/buscar?q=2221234567 (JWT asesor)
  API->>DB: Consulta paciente + proyectarPacientePorRol (CURP ****ZN04)
  API->>DB: INSERT auditoria (leer PacienteBusqueda)
  API-->>Consola: Ficha enmascarada + canal actual (whatsapp)

  Carlos->>Consola: Valida identidad por preguntas de seguridad
  Consola->>API: POST /otp/verificar-call-center (fechaNac + últimos 4 dígitos)
  API->>Redis: SET otp:verificado:pac_ana_demo:call_center
  API-->>Consola: { verificado: true }

  Consola->>API: GET /pacientes/pac_ana_demo/timeline + GET /pacientes/pac_ana_demo/contexto
  API-->>Consola: Historial Web → WhatsApp + Ultrasonido abdominal + Puebla Centro

  Carlos->>Consola: Registra llamada (Alt+L) y confirma cita
  Consola->>API: POST /canales/llamadas (motivo, notas, resultado)
  API->>DB: INSERT interacciones (canal=call_center)
  Consola->>API: POST /tramites/:id/avanzar (estadoDestino=cita_confirmada, canal=call_center)
  API->>DB: UPDATE tramites + UPDATE citas (confirmada) + eventos (canal.cambiado, cita.confirmada)
  API->>Redis: SET ctx:pac_ana_demo + XADD eventos

  Note over API,App: Etapa 4 — Propagación en tiempo real y App Móvil
  API-->>Journey: Socket.IO sala paciente:pac_ana_demo (cita.confirmada)
  API->>Redis: GET push:pac_ana_demo (ExpoPushToken)
  API->>Push: POST /v2/push/send ("Tu cita está confirmada", sin datos clínicos)
  Push-->>App: Notificación push nativa en dispositivo de Ana

  Ana->>App: Abre la App Salud Digna (JWT en expo-secure-store)
  App->>API: GET /pacientes/pac_ana_demo/tramites + GET /pacientes/pac_ana_demo/timeline
  API-->>App: Cita confirmada + código de confirmación + timeline Web → WhatsApp → Call Center → App
```

---

## 3. Secuencia: Jerarquía de resultados clínicos (#30) y Facturación PDF (#33)

Fuente Mermaid: [`secuencias/diagramas/03-resultados-y-facturacion.mmd`](secuencias/diagramas/03-resultados-y-facturacion.mmd).

```mermaid
sequenceDiagram
  autonumber
  actor Revisor as Revisor Técnico
  actor Medico as Médico Validador
  actor Ana as Ana (WhatsApp / App)
  participant API as Núcleo API (NestJS)
  participant DB as MySQL 8 + Auditoría
  participant Bot as WhatsApp Bot
  participant App as App Móvil (Expo)

  Note over Revisor,Ana: A. Jerarquía clínica de liberación de resultados (#30)
  Ana->>API: GET /resultados (cuando estado = captura)
  API-->>Ana: { total: 0, resultados: [] } (GET /:id retorna 403 Forbidden)

  Revisor->>API: POST /resultados/:id/revisar (aprobado=true, rol=revisor_tecnico)
  API->>DB: estado = revision_tecnica + INSERT auditoria
  Medico->>API: POST /resultados/:id/validar (aprobado=true, rol=medico)
  API->>DB: estado = validacion_medica + INSERT auditoria
  Medico->>API: POST /resultados/:id/liberar (rol=medico)
  API->>DB: estado = liberado + genera PDF + INSERT auditoria + evento resultado.liberado
  API-->>App: Push Expo ("Tus resultados ya están listos") + notificación canal preferido

  Ana->>API: GET /resultados/:id/pdf (JWT paciente)
  API-->>Ana: 200 OK (application/pdf)

  Note over Ana,App: B. Facturación simulada omnicanal (#33)
  Ana->>API: PUT /facturacion/pacientes/pac_ana_demo/datos-fiscales (RFC, régimen, CP)
  API->>DB: Guarda datosFiscalesCifrados (AES-256-GCM)
  Ana->>Bot: "Quiero mi factura" (sesión WhatsApp verificada con OTP)
  Bot->>API: POST /facturacion/solicitar (reutiliza datos cifrados)
  API-->>Bot: { factura: { estatus: "emitida" }, pdfUrl }
  Bot->>API: GET /facturacion/:id/pdf (x-service-token)
  Bot-->>Ana: Sube PDF a Meta (media_id) y envía documento por WhatsApp
  Ana->>App: Abre detalle del trámite → GET /facturacion/tramites/:folio
  App-->>Ana: Botón "Descargar factura PDF" disponible
```

---

## 4. Flujo de datos y relación con el Modelo ER (#2)

Fuente Mermaid: [`secuencias/diagramas/04-flujo-datos-y-modelo.mmd`](secuencias/diagramas/04-flujo-datos-y-modelo.mmd).

```mermaid
flowchart TD
  subgraph Canales["1. Canales de Atención (sin acceso directo a BD)"]
    W["Portal Web / Consola / Journey / Admin (Next.js)"]
    WA["WhatsApp Bot (Cloud API + Cola + HMAC)"]
    APP["App Móvil (Expo Router + SecureStore + Push)"]
  end

  subgraph Seguridad["2. Puerta Única API NestJS (Validación + Privacidad)"]
    G["JwtAuthGuard + RolesGuard + PermissionsGuard + AccesoPacienteService (OTP)"]
    Z["Validación Zod (contrato @salud-digna/shared)"]
    C["Privacidad LFPDPPP: AES-256-GCM + curp_hash + Enmascarado + SanitizedLogger"]
  end

  subgraph Dominio["3. Motores de Dominio"]
    ID["Identidad + OTP (#7, #8, #9)"]
    TR["Trámites + Contexto + Vigencias (#12, #13, #25)"]
    IA["Asistente IA + Guardrails 911 + i18n (#24, #25, #26)"]
    OP["Tickets + Resultados + Servicio + Alertas + Facturación (#16, #30-#33)"]
    BUS["EventBus Outbox (grupos: timeline, tickets, metricas, notificaciones, realtime)"]
  end

  subgraph Datos["4. Almacenamiento y Tiempo Real"]
    SQL[("MySQL 8 (15 tablas Prisma)\npacientes, identidades_canal, tramites,\npasos_tramite, citas, resultados,\ninteracciones, eventos, tickets, auditoria")]
    RED[("Redis 7 (AOF)\notp:* · ctx:* · cat:*\npush:* · wa:sesion:* · Stream eventos")]
    SIO["Socket.IO (salas paciente:{id}, rol:asesor, rol:admin)"]
  end

  W & WA & APP --> G --> Z --> C
  C --> ID & TR & IA & OP
  ID & TR & IA & OP --> BUS
  ID & TR & OP --> SQL
  ID & TR & BUS --> RED
  BUS --> SQL
  BUS --> SIO --> W
```

### Diagrama Entidad-Relación exportado (MySQL 8 + Prisma)

Ver documentación completa de las 15 tablas e índices en [`docs/modelo-datos/README.md`](modelo-datos/README.md).

![Diagrama Entidad-Relación del modelo de datos](modelo-datos/diagramas/er-modelo-datos.svg)

---

## 5. Mapa exacto de datos en tránsito, caché y persistencia

| Etapa | Clave en Redis (TTL) | Tablas MySQL impactadas | Evento Zod emitido |
| --- | --- | --- | --- |
| Resolución y OTP | `otp:{pacienteId}` (5 min, SHA-256) · `otp:verificado:{id}:{canal}` (30 min) | `pacientes`, `identidades_canal`, `auditoria` | `identidad.resuelta`, `identidad.verificada`, `identidad.vinculada` |
| Autoguardado de trámite | `ctx:{pacienteId}` (24 h) | `tramites`, `pasos_tramite`, `eventos` | `cotizacion.iniciada`, `estudio.seleccionado`, `clinica.seleccionada`, `canal.cambiado` |
| Agenda y confirmación | `ctx:{pacienteId}` (24 h) · `push:{pacienteId}` (180 d) | `tramites`, `citas`, `interacciones`, `eventos` | `cita.agendada`, `cita.confirmada` |
| Catálogos cacheados | `cat:estudios:*` · `cat:clinicas:*` (10 min) | `estudios`, `clinicas` | — |
| Sesión de WhatsApp | `wa:sesion:{telefono}` (24 h) | `interacciones` (`referencia_externa` única) | `ticket.creado`, `canal.cambiado` |
| Resultados y auditoría | Stream `eventos` | `resultados`, `eventos`, `auditoria` | `resultado.liberado` |
