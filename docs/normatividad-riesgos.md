# Matriz de Normatividad y Gestión de Riesgos — Salud Digna Omnicanal

> [!NOTE]
> Este documento respalda el cumplimiento normativo y la gestión de riesgos del prototipo **Salud Digna Omnicanal** (Issue #34). Al tratarse de un prototipo académico/hackatón con datos 100% ficticios (`esDemo: true`), **no constituye una certificación oficial** ante COFEPRIS, INAI, ISO o el SAT, sino un diseño alineado por principio (*compliance by design*).

---

## 1. Marco Normativo de Salud y Protección de Datos (México — Obligatorio)

### 1.1 NOM-024-SSA3-2012 — Sistemas de Información de Registro Electrónico para la Salud (SIRES)

Establece los objetivos funcionales y funcionalidades mínimas que deben observar los productos de sistemas electrónicos en salud para garantizar interoperabilidad, procesamiento, interpretación, confidencialidad, seguridad y uso de estándares.

- **Identificación única del paciente:** Motor de resolución de identidad (`IdentityResolverService`, #7) que evita duplicados mediante normalización E.164, correo en minúsculas y `curp_hash` determinista (sin *fuzzy matching* por nombre) y registro controlado de fusiones (`POST /identidad/merge`).
- **Trazabilidad y bitácora inmutable:** Todo cambio de estado emite un evento estructurado validado con Zod (`packages/shared/events`, #3), persistido en tabla `eventos` (patrón Outbox, #14) y reflejado en la línea de tiempo unificada (`TimelineService`, #15) y la bitácora de auditoría (`AuditoriaService`, #11).
- **Control de acceso basado en roles (RBAC):** Matriz explícita de roles y permisos (`MATRIZ_PERMISOS_POR_ROL`, #6) con `JwtAuthGuard`, `RolesGuard` y `PermissionsGuard` aplicados globalmente en `apps/api`.
- **Interoperabilidad por API única:** Todos los canales (Web, App móvil, WhatsApp Bot y Consola Call Center) consumen exclusivamente `apps/api` sin acceso directo a MySQL ni Redis.

### 1.2 NOM-004-SSA3-2012 — Del Expediente Clínico

Regula la titularidad, propiedad, conservación, confidencialidad y validación profesional de la información clínica del paciente.

- **Jerarquía estricta de liberación de resultados (#30):** Ningún resultado clínico es visible ni descargable por el paciente hasta completar la cadena `captura → revisión técnica (revisor_tecnico) → validación médica (medico) → liberación`. El intento de acceso anticipado retorna `403 Forbidden`.
- **Registro de autoría y marca temporal:** Cada revisión técnica, validación médica y liberación guarda `revisadoPorId`, `revisadoEn`, `validadoPorId`, `validadoEn` y `liberadoEn` con entrada obligatoria en auditoría (`accion: liberar_resultado`).
- **Límites éticos y clínicos de la IA (#24, #25):** El asistente virtual cuenta con *guardrails* deterministas que prohíben emitir diagnósticos, recetar medicamentos o interpretar resultados clínicos; ante síntomas de alarma deriva de inmediato al **911** y abre ticket de prioridad `critica`.
- **Comunicación médico-paciente trazada:** Canal de mensajes rápido asociado al resultado con indicador de tiempo esperado de respuesta y registro en auditoría.

### 1.3 LFPDPPP — Ley Federal de Protección de Datos Personales en Posesión de los Particulares

La LFPDPPP clasifica los datos de salud como **datos personales sensibles** que exigen medidas de seguridad administrativas, técnicas y físicas reforzadas.

- **Aviso de privacidad y consentimiento (#10):** Aviso simplificado e integral versionado (`aviso-privacidad.ts`), registro de consentimiento con marca de tiempo, canal e IP (`ConsentimientoService`), y respeto a revocación antes de enviar alertas epidemiológicas o notificaciones (#32).
- **Cifrado de campos sensibles:** Cifrado en reposo **AES-256-GCM** (`CifradoService`) para CURP, fecha de nacimiento y datos fiscales (`datosFiscalesCifrados`, #33), con `curp_hash` con *pepper* secreto para búsquedas sin descifrar.
- **Principio de minimización y enmascarado por rol:** Proyección por rol (`proyectarPacientePorRol`) que enmascara CURP (`****ZN04`), teléfono y correo en consola de asesores, envía solo contexto mínimo al proveedor LLM (#24) y sanitiza logs para impedir fuga de PII (`sanitizador-logs.ts`).
- **Verificación antes de revelar (#8):** Ningún canal externo revela datos ni avances del trámite hasta validar OTP (hasheado, 5 min de vigencia, bloqueo tras 3 intentos fallidos) o preguntas de seguridad en Call Center.

---

## 2. Normas Internacionales de Referencia (Opcionales)

### 2.1 ISO/IEC 27001 — Sistema de Gestión de Seguridad de la Información

| Control Anexo A | Aplicación en Salud Digna Omnicanal | Issues |
| --- | --- | --- |
| A.5 / A.8 Control de acceso y autenticación | JWT de corta duración (15 min) + *refresh* con rotación y revocación, RBAC, `x-service-token` interno y verificación OTP | #6, #8, #9, #29 |
| A.8.24 Uso de criptografía | Contraseñas con `bcrypt`, OTP hasheado SHA-256, AES-256-GCM en campos sensibles, HMAC-SHA256 en webhooks de Meta | #6, #8, #10, #20 |
| A.8.15 Registro y monitoreo | `AuditInterceptor` automático, exportación CSV solo `admin`, sanitización de logs sin PII | #10, #11 |
| A.8.13 Respaldo y continuidad | Persistencia MySQL 8 + Redis AOF, outbox con reintentos, despliegue Docker Compose con Nginx HTTPS y caché offline en App | #2, #13, #14, #22, #35 |

### 2.2 ISO 9001 — Sistema de Gestión de la Calidad

| Principio ISO 9001 | Aplicación en Salud Digna Omnicanal | Issues |
| --- | --- | --- |
| Enfoque al cliente | Continuidad sin repetir datos entre canales, autoguardado en cada paso, modo "Explícame fácil", soporte `es`/`en`/`nah` | #13, #18, #21, #26 |
| Enfoque a procesos | Máquina de estados determinista de trámites (`cotizacion → cerrado/cancelado`) y jerarquía clínica de resultados | #12, #30, #31 |
| Toma de decisiones basada en evidencia | Dashboard de KPIs calculado sobre eventos reales (% retomados en otro canal, tiempos de atención, resolución en primer contacto) | #27, #28 |
| Mejora continua y control de no conformidades | Cola de tickets con SLA por prioridad, monitor de SLA vencidos, escalamiento `IA → asesor → asesor_pro` y pruebas automatizadas en CI | #5, #16, #25 |

---

## 3. Tabla de Trazabilidad (Norma → Requisito → Implementación → Issue)

| Norma | Requisito clave | Implementación en el repositorio | Issue(s) |
| --- | --- | --- | --- |
| **NOM-024-SSA3** | Identificador único y control de duplicados | `apps/api/src/identidad/identidad.service.ts` (`resolver`, `fusionarDuplicados`) | #7 |
| **NOM-024-SSA3** | Trazabilidad cronológica de eventos | `packages/shared/src/events/catalogo.ts`, `apps/api/src/eventos/`, `timeline/` | #3, #14, #15 |
| **NOM-024-SSA3** | Control de acceso por perfil | `apps/api/src/auth/permisos.ts`, `guards.ts`, `apps/web/src/middleware.ts` | #6, #29 |
| **NOM-004-SSA3** | Validación profesional previa a liberación | `apps/api/src/resultados/resultados.service.ts` (`captura → liberado`) | #30 |
| **NOM-004-SSA3** | No emitir diagnósticos automatizados | `apps/api/src/ia/clasificador-nlp.ts`, `ia.service.ts` (`guardrail: no_diagnostico`) | #24 |
| **NOM-004-SSA3** | Derivación oportuna de urgencias | Detección de síntomas de alarma → 911 inmediato + ticket `critica` | #25 |
| **LFPDPPP** | Aviso de privacidad y consentimiento | `apps/api/src/privacidad/aviso-privacidad.ts`, `consentimiento.service.ts` | #10, #32 |
| **LFPDPPP** | Cifrado y enmascarado de datos sensibles | `apps/api/src/privacidad/cifrado.service.ts`, `enmascarado.ts`, `facturacion.service.ts` | #10, #33 |
| **LFPDPPP** | Verificación previa a revelar contexto | `apps/api/src/otp/otp.service.ts`, `acceso-paciente.service.ts` | #8 |
| **LFPDPPP** | Bitácora de auditoría sin PII | `apps/api/src/auditoria/`, `privacidad/sanitizador-logs.ts` | #10, #11 |
| **ISO/IEC 27001** | Autenticidad de webhooks externos | `apps/whatsapp-bot/src/cloud-api/firma.ts` (`X-Hub-Signature-256`) | #20 |
| **ISO/IEC 27001** | Recuperación segura sin exposición de clave | `apps/api/src/auth/recuperacion.service.ts` (token de un solo uso 30 min) | #9 |
| **ISO 9001** | Medición de KPIs reales y trazabilidad de servicio | `apps/api/src/metricas/`, `apps/api/src/servicio/`, `apps/web/src/app/admin/` | #27, #28, #31 |
| **ISO 9001** | Gestión de SLA y escalamiento jerárquico | `apps/api/src/tickets/tickets.service.ts` (`verificarSlasVencidos`, `escalar`) | #16, #25 |

---

## 4. Matriz de Riesgos (Probabilidad × Impacto)

**Escala:** Probabilidad (`P`: 1 muy baja – 5 muy alta) × Impacto (`I`: 1 mínimo – 5 crítico) = **Nivel (`P × I`)**:
- **15–25 (Crítico / Alto):** mitigación técnica obligatoria antes del demo.
- **8–14 (Medio):** mitigación preventiva y plan de contingencia.
- **1–7 (Bajo):** monitoreo continuo.

| ID | Riesgo | P | I | P×I | Nivel | Mitigación implementada / plan de contingencia | Responsable | Issue(s) | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **R-01** | **Fuga de datos personales sensibles (PII/salud)** por logs, respuestas excesivas o acceso no autorizado | 2 | 5 | **10** | Medio-Alto | Cifrado AES-256-GCM en campos sensibles, enmascarado por rol, sanitización automática de logs, bloqueo de resultados no liberados (`403`), contexto mínimo hacia LLM y uso exclusivo de datos ficticios (`esDemo: true`) en el demo. | Seguridad / Núcleo API | #6, #10, #11, #30 | Implementada |
| **R-02** | **Suplantación de identidad en WhatsApp** (tercero escribiendo desde otro número o intentando leer trámites ajenos) | 3 | 5 | **15** | **Alto** | Regla inviolable "verificar antes de revelar": OTP de 6 dígitos hasheado con vigencia de 5 min y bloqueo tras 3 fallos (`AccesoPacienteService`), firma HMAC-SHA256 obligatoria en webhooks y preguntas de seguridad en Call Center. | Identidad / WhatsApp | #7, #8, #20 | Implementada |
| **R-03** | **Caída del servidor o reinicio de contenedores durante el demo** | 3 | 5 | **15** | **Alto** | Persistencia en MySQL 8 + Redis AOF, reconstrucción de estado/timeline/tickets/interacciones al arrancar (`onModuleInit`), patrón Outbox con reintentos, Nginx con resolución dinámica de upstreams, caché offline en App móvil y script `demo:reset` para restablecer escenario en segundos. | Infra / Núcleo API | #13, #14, #22, #35 | Implementada |
| **R-04** | **Rechazo de plantillas o bloqueo de envío por Meta WhatsApp Cloud API** (p. ej. prefijo `521` MX o ventana 24 h) | 3 | 4 | **12** | Medio-Alto | Normalización de teléfonos MX (`telefonoParaEnvioMeta` removiendo `521`), respuesta `200 OK` inmediata con cola asíncrona + deduplicación por `message.id`, plantillas predefinidas para > 24 h y modo simulado/fallback seguro en desarrollo y contingencia. | Canal WhatsApp | #20, #21 | Implementada |
| **R-05** | **Respuestas incorrectas, alucinaciones o consejo clínico indebido de la IA** | 3 | 5 | **15** | **Alto** | Guardrails deterministas previos y posteriores al LLM (prohibición absoluta de diagnóstico/receta/interpretación), detección fija de síntomas de alarma con derivación inmediata a **911**, umbral de confianza `< 0.6` con fallback a menú, escalamiento automático tras 2 fallos seguidos y set de evaluación automatizado de 50 frases (`npm run eval:ia`, precisión > 95%). | IA / Backend | #24, #25 | Implementada |
| **R-06** | **Duplicidad de perfiles de pacientes al iniciar en múltiples canales** | 3 | 4 | **12** | Medio-Alto | Normalización estricta de teléfono E.164, email y `curp_hash`; detección de casos `ambiguo` sin auto-fusión ciega y flujo de fusión manual auditado (`POST /identidad/merge`, solo `asesor_pro`/`admin`). | Identidad | #7, #11 | Implementada |
| **R-07** | **Incumplimiento de SLA en tickets críticos o quejas no atendidas** | 2 | 4 | **8** | Medio | Balanceo automático de carga por región, monitor periódico de SLA vencidos (`ticket.sla_vencido`), escalamiento `IA → asesor → asesor_pro` con resumen de ≤ 5 líneas y visibilidad en tiempo real en `/consola` y `/admin`. | Contact Center / Backend | #16, #19, #25, #28 | Implementada |
| **R-08** | **Pérdida temporal de conectividad en clínica o teléfono del paciente** | 3 | 3 | **9** | Medio | Autoguardado de trámites en cada paso en Web, pantalla de estado sin conexión con caché local cifrada en App Expo y consulta de estatus de clínica (`operando`/`retraso`/`fuera_de_servicio`) con banners preventivos. | Web / App Móvil | #13, #22, #31 | Implementada |

---

## 5. Revisión y Mantenimiento

- **Frecuencia sugerida:** revisión previa a cada hito de entrega y antes del despliegue a producción en VPS (#35).
- **Evidencia automatizada en CI (`.github/workflows/ci.yml`):** validación de esquema Prisma, sincronización del catálogo de eventos (`docs:eventos:check`), análisis estático (`lint` + `typecheck`), pruebas de seguridad RBAC/OTP/cifrado/auditoría/guardrails IA y verificación de precisión NLP (`npm run eval:ia`).
