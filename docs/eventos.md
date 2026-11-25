# Catálogo de eventos omnicanal

> Issue: **03. [ARQ] Catálogo de eventos omnicanal** (#3)
>
> **Archivo generado automáticamente** desde los esquemas Zod de [`packages/shared/src/events/catalogo.ts`](../packages/shared/src/events/catalogo.ts).
> No edites manualmente las tablas ni los ejemplos; actualiza los esquemas y ejecuta `npm run docs:eventos`.

## 1. Convención de nombres y sobre común

Todo cambio de estado en la plataforma emite un evento con el patrón `dominio.accion` en minúsculas y `snake_case` (expresión regular `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`).

### Estructura común obligatoria

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `eventId` | `UUID v4` | Identificador único del evento; garantiza idempotencia en consumidores (ADR 0003). |
| `tipo` | `dominio.accion` | Clave discriminante del catálogo. |
| `version` | `int >= 1` | Versión del esquema de `datos`. |
| `pacienteId` | `string \| null` | Identificador del paciente (nulo solo si aún no está resuelto). |
| `tramiteId` | `string \| null` | Identificador del trámite asociado cuando aplica. |
| `canal` | `CanalAtencion` | Canal donde ocurrió la acción (`web`, `app`, `whatsapp`, `call_center`, `email`). |
| `actor` | `{ tipo, id }` | Quién ejecutó la acción (`paciente`, `asesor_ia`, `asesor`, `medico`, `sistema`, etc.). |
| `timestamp` | `ISO-8601 UTC` | Fecha y hora exacta de emisión. |
| `datos` | `object` | Payload específico validado con Zod según `tipo` y `version`. |

## 2. Regla de versionado

- **Cambios compatibles (misma versión):** agregar propiedades opcionales a `datos` o ampliar documentación no rompe consumidores existentes.
- **Cambios incompatibles (nueva versión):** renombrar, eliminar o cambiar el tipo de una propiedad obligatoria exige incrementar `version` (por ejemplo `v2`). Ambas versiones coexisten en `packages/shared/src/events` hasta migrar todos los consumidores.
- **Uso obligatorio del contrato:** todos los canales y módulos del API deben importar los tipos y validadores desde `@salud-digna/shared` (o `@salud-digna/shared/events`).

## 3. Tabla de eventos (generada desde Zod)

| Evento (`tipo`) | Versión | Emisor | Consumidores | Propósito |
| --- | --- | --- | --- | --- |
| `paciente.registrado` | v1 | `identidad` | `timeline`, `metricas`, `auditoria` | Alta inicial o registro ligero de un paciente ficticio en cualquier canal. |
| `identidad.resuelta` | v1 | `identidad` | `metricas`, `auditoria` | Resultado de buscar un identificador normalizado al entrar desde un canal. |
| `identidad.vinculada` | v1 | `identidad` | `timeline`, `auditoria` | Se vincula una nueva IdentidadCanal al paciente tras verificar titularidad. |
| `identidad.verificada` | v1 | `otp` | `timeline`, `realtime`, `auditoria` | El paciente supera OTP o preguntas de seguridad; se habilita revelar su contexto. |
| `consentimiento.otorgado` | v1 | `privacidad` | `timeline`, `auditoria` | El paciente acepta el aviso de privacidad o uso de datos sensibles (LFPDPPP). |
| `cotizacion.iniciada` | v1 | `tramites` | `timeline`, `realtime`, `metricas` | Se crea un nuevo trámite con folio legible en estado inicial de cotización. |
| `estudio.seleccionado` | v1 | `contexto` | `timeline`, `realtime`, `metricas` | El paciente elige el estudio a realizar y se autoguarda en el contexto. |
| `clinica.seleccionada` | v1 | `contexto` | `timeline`, `realtime`, `metricas` | El paciente selecciona clínica y el contexto persiste el avance antes de confirmar. |
| `tramite.pausado` | v1 | `tramites` | `timeline`, `realtime`, `metricas` | El trámite queda pausado conservando estado previo y datos pendientes. |
| `tramite.avanzado` | v1 | `tramites` | `timeline`, `realtime`, `metricas` | Transición genérica de la máquina de estados sin evento de dominio específico (ej. registro, pago, en proceso, cierre). |
| `tramite.cancelado` | v1 | `tramites` | `timeline`, `realtime`, `notificaciones`, `metricas` | El trámite se cancela (estado terminal) y, si existía, se cancela su cita. |
| `canal.cambiado` | v1 | `contexto` | `timeline`, `realtime`, `metricas` | El paciente continúa el mismo trámite desde un canal distinto al último usado. |
| `tramite.retomado` | v1 | `tramites` | `timeline`, `realtime`, `metricas` | Se reanuda un trámite pausado exactamente en el paso donde quedó. |
| `cita.agendada` | v1 | `tramites` | `timeline`, `realtime`, `notificaciones`, `metricas` | Se reserva fecha y hora para el estudio en la clínica elegida. |
| `cita.confirmada` | v1 | `tramites` | `timeline`, `realtime`, `notificaciones`, `metricas` | La cita queda confirmada y se notifica al paciente por su canal preferido/app. |
| `ticket.creado` | v1 | `tickets` | `timeline`, `realtime`, `tickets`, `metricas` | Se abre un ticket de atención con prioridad, región y fecha límite de SLA. |
| `ticket.escalado` | v1 | `tickets` | `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria` | Un ticket sube de nivel en la jerarquía del Contact Center (IA → asesor → asesor pro). |
| `ticket.asignado` | v1 | `tickets` | `timeline`, `realtime`, `metricas`, `auditoria` | Un ticket se asigna (o reasigna) a un asesor; automático por menor carga regional o manual. |
| `ticket.sla_vencido` | v1 | `tickets` | `realtime`, `notificaciones`, `metricas` | Alerta emitida por el job de SLA cuando un ticket excede su tiempo objetivo. |
| `ticket.cerrado` | v1 | `tickets` | `timeline`, `realtime`, `metricas` | El ticket queda resuelto y cerrado con registro de tiempo de atención. |
| `resultado.liberado` | v1 | `resultados` | `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria` | Tras revisión técnica y validación médica, el resultado queda visible para el paciente. |
| `sesion.aviso_inactividad` | v1 | `sesiones` | `timeline`, `metricas` | Único aviso de inactividad de la conversación: ya anuncia el cierre y cómo retomar (traspaso v2, sección 5). |
| `contexto.transferido` | v1 | `canales` | `timeline`, `realtime`, `metricas`, `auditoria` | El trámite cambia de canal propietario (p. ej. WhatsApp → llamada); el canal anterior deja de escribir. |
| `canal.propietario_liberado` | v1 | `canales` | `timeline`, `realtime` | El canal propietario deja el trámite (al colgar o por caducidad): cualquier canal puede retomarlo. |
| `cita.apartada` | v1 | `tramites` | `timeline`, `realtime` | Se aparta un horario sin confirmar; se libera si vence el plazo. |
| `cupo.liberado` | v1 | `tramites` | `timeline`, `realtime`, `metricas` | El horario apartado venció sin confirmar; al retomar se propone otro sin pedir datos. |
| `identidad.codigo_enviado` | v1 | `otp` | `timeline`, `auditoria` | Se envió un código de un solo uso; nunca incluye el código. |
| `identidad.codigo_vencido` | v1 | `sesiones` | `timeline`, `auditoria` | El código venció sin usarse; antes de mostrar datos se pide uno nuevo. |
| `enrutamiento.escalado` | v1 | `enrutamiento` | `timeline`, `realtime`, `tickets`, `metricas`, `auditoria` | La ruta por riesgo decidió que atienda una persona (Compartir, Escalar o Evitar). |
| `enrutamiento.atendido` | v1 | `enrutamiento` | `metricas` | La ruta por riesgo permite resolver en autoservicio o con el bot (Aceptar o Reducir). |
| `acceso.consultado` | v1 | `canales` | `auditoria` | Alguien consultó el contexto de un paciente (bitácora de accesos, sin el contenido). |
| `acceso.denegado` | v1 | `canales` | `auditoria`, `metricas` | Se negó una consulta por falta de verificación o de permiso. |
| `resultado.valor_critico` | v1 | `resultados` | `timeline`, `realtime`, `tickets`, `auditoria` | Un resultado con valor crítico: el bot queda bloqueado y una persona avisa (sin contenido en el evento). |
| `incidente.registrado` | v1 | `enrutamiento` | `timeline`, `realtime`, `tickets`, `auditoria` | Emergencia o incidente derivado a una persona; el trámite se pausa sin perder lo avanzado. |
| `entrega.retrasada` | v1 | `resultados` | `timeline`, `realtime`, `notificaciones` | Un estudio de la orden no estará en la fecha comprometida (INC-O4-05): se informa la nueva fecha. |
| `seguimiento.correo_enviado` | v1 | `seguimiento` | `timeline`, `metricas` | Correo de seguimiento sin datos clínicos, con enlace personal que vence y pide código. |
| `seguimiento.plantilla_enviada` | v1 | `seguimiento` | `timeline`, `metricas` | Plantilla de WhatsApp enviada fuera de la ventana de 24 h (con costo). |
| `compromiso.vencido` | v1 | `sesiones` | `timeline`, `realtime`, `tickets`, `metricas` | Venció el compromiso de atención humana de la ruta (p. ej. una persona en menos de 2 min). |

## 4. Ejemplos de payload validados

> Todos los ejemplos utilizan datos 100% ficticios del escenario demo de **Ana López** y son validados por `EventoOmnicanalSchema.parse()` durante la generación.

### `paciente.registrado` (v1)

- **Descripción:** Alta inicial o registro ligero de un paciente ficticio en cualquier canal.
- **Emisor:** `identidad`
- **Consumidores:** `timeline`, `metricas`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000001",
  "tipo": "paciente.registrado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": null,
  "canal": "web",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T10:10:00Z",
  "datos": {
    "registroLigero": true,
    "canalPreferido": "whatsapp",
    "idioma": "es",
    "region": "Puebla",
    "esDemo": true
  }
}
```

### `identidad.resuelta` (v1)

- **Descripción:** Resultado de buscar un identificador normalizado al entrar desde un canal.
- **Emisor:** `identidad`
- **Consumidores:** `metricas`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000002",
  "tipo": "identidad.resuelta",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": null,
  "canal": "whatsapp",
  "actor": {
    "tipo": "sistema",
    "id": "identity-resolver"
  },
  "timestamp": "2026-11-24T14:00:00Z",
  "datos": {
    "estadoResolucion": "requiere_verificacion",
    "canalOrigen": "whatsapp",
    "coincidencias": 1
  }
}
```

### `identidad.vinculada` (v1)

- **Descripción:** Se vincula una nueva IdentidadCanal al paciente tras verificar titularidad.
- **Emisor:** `identidad`
- **Consumidores:** `timeline`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000003",
  "tipo": "identidad.vinculada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": null,
  "canal": "whatsapp",
  "actor": {
    "tipo": "sistema",
    "id": "identity-resolver"
  },
  "timestamp": "2026-11-24T14:02:00Z",
  "datos": {
    "identidadCanalId": "idc_wa_ana_01",
    "canalVinculado": "whatsapp",
    "metodoVerificacion": "otp_whatsapp"
  }
}
```

### `identidad.verificada` (v1)

- **Descripción:** El paciente supera OTP o preguntas de seguridad; se habilita revelar su contexto.
- **Emisor:** `otp`
- **Consumidores:** `timeline`, `realtime`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000004",
  "tipo": "identidad.verificada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T14:02:05Z",
  "datos": {
    "metodo": "otp_whatsapp",
    "canalVerificado": "whatsapp",
    "sesionValidaHasta": "2026-11-24T14:32:05Z"
  }
}
```

### `consentimiento.otorgado` (v1)

- **Descripción:** El paciente acepta el aviso de privacidad o uso de datos sensibles (LFPDPPP).
- **Emisor:** `privacidad`
- **Consumidores:** `timeline`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000005",
  "tipo": "consentimiento.otorgado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": null,
  "canal": "web",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T10:10:30Z",
  "datos": {
    "consentimientoId": "con_001",
    "tipo": "aviso_privacidad",
    "versionAviso": "v1.0-2026"
  }
}
```

### `cotizacion.iniciada` (v1)

- **Descripción:** Se crea un nuevo trámite con folio legible en estado inicial de cotización.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000006",
  "tipo": "cotizacion.iniciada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T10:12:00Z",
  "datos": {
    "folio": "SD-2026-000123",
    "tipoTramite": "estudio",
    "estudioId": "est_us_abd",
    "region": "Puebla"
  }
}
```

### `estudio.seleccionado` (v1)

- **Descripción:** El paciente elige el estudio a realizar y se autoguarda en el contexto.
- **Emisor:** `contexto`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000007",
  "tipo": "estudio.seleccionado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T10:13:00Z",
  "datos": {
    "estudioId": "est_us_abd",
    "estudioNombre": "Ultrasonido abdominal",
    "precio": 450,
    "requierePreparacion": true
  }
}
```

### `clinica.seleccionada` (v1)

- **Descripción:** El paciente selecciona clínica y el contexto persiste el avance antes de confirmar.
- **Emisor:** `contexto`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000008",
  "tipo": "clinica.seleccionada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T10:15:00Z",
  "datos": {
    "clinicaId": "cli_09",
    "clinicaNombre": "Salud Digna Puebla Centro",
    "estudioId": "est_us_abd",
    "region": "Puebla"
  }
}
```

### `tramite.pausado` (v1)

- **Descripción:** El trámite queda pausado conservando estado previo y datos pendientes.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000009",
  "tipo": "tramite.pausado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "sistema",
    "id": "contexto-timeout"
  },
  "timestamp": "2026-11-24T10:45:00Z",
  "datos": {
    "folio": "SD-2026-000123",
    "estadoPrevio": "seleccion_clinica",
    "pasoActual": "seleccion_clinica",
    "pendientes": [
      "confirmar_fecha",
      "aceptar_preparacion"
    ],
    "motivo": "Inactividad en sesión web"
  }
}
```

### `tramite.avanzado` (v1)

- **Descripción:** Transición genérica de la máquina de estados sin evento de dominio específico (ej. registro, pago, en proceso, cierre).
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000019",
  "tipo": "tramite.avanzado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T16:05:00Z",
  "datos": {
    "folio": "SD-2026-000123",
    "estadoAnterior": "cita_confirmada",
    "estadoNuevo": "pago_factura",
    "pasoActual": "pago_factura"
  }
}
```

### `tramite.cancelado` (v1)

- **Descripción:** El trámite se cancela (estado terminal) y, si existía, se cancela su cita.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `notificaciones`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000020",
  "tipo": "tramite.cancelado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "app",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-25T08:00:00Z",
  "datos": {
    "folio": "SD-2026-000123",
    "estadoPrevio": "cita_agendada",
    "citaCancelada": true,
    "motivo": "La paciente reprogramará más adelante"
  }
}
```

### `canal.cambiado` (v1)

- **Descripción:** El paciente continúa el mismo trámite desde un canal distinto al último usado.
- **Emisor:** `contexto`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000010",
  "tipo": "canal.cambiado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T14:02:10Z",
  "datos": {
    "canalAnterior": "web",
    "canalNuevo": "whatsapp",
    "pasoActual": "seleccion_clinica",
    "verificado": true
  }
}
```

### `tramite.retomado` (v1)

- **Descripción:** Se reanuda un trámite pausado exactamente en el paso donde quedó.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000011",
  "tipo": "tramite.retomado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor_ia",
    "id": "bot_wa_v1"
  },
  "timestamp": "2026-11-24T14:02:15Z",
  "datos": {
    "folio": "SD-2026-000123",
    "estadoRestaurado": "seleccion_clinica",
    "pasoActual": "seleccion_clinica",
    "canalAnterior": "web",
    "canalActual": "whatsapp"
  }
}
```

### `cita.agendada` (v1)

- **Descripción:** Se reserva fecha y hora para el estudio en la clínica elegida.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `notificaciones`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000012",
  "tipo": "cita.agendada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T14:05:00Z",
  "datos": {
    "citaId": "cit_789",
    "clinicaId": "cli_09",
    "fechaHora": "2026-11-26T09:00:00Z",
    "codigoConfirmacion": "SD9K2M"
  }
}
```

### `cita.confirmada` (v1)

- **Descripción:** La cita queda confirmada y se notifica al paciente por su canal preferido/app.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `notificaciones`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000013",
  "tipo": "cita.confirmada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T15:20:00Z",
  "datos": {
    "citaId": "cit_789",
    "clinicaId": "cli_09",
    "fechaHora": "2026-11-26T09:00:00Z",
    "confirmadaPorCanal": "call_center"
  }
}
```

### `ticket.creado` (v1)

- **Descripción:** Se abre un ticket de atención con prioridad, región y fecha límite de SLA.
- **Emisor:** `tickets`
- **Consumidores:** `timeline`, `realtime`, `tickets`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000014",
  "tipo": "ticket.creado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T15:15:00Z",
  "datos": {
    "ticketId": "tkt_101",
    "folio": "TK-2026-000042",
    "tipo": "duda",
    "prioridad": "media",
    "region": "Puebla",
    "slaVenceEn": "2026-11-24T19:15:00Z"
  }
}
```

### `ticket.escalado` (v1)

- **Descripción:** Un ticket sube de nivel en la jerarquía del Contact Center (IA → asesor → asesor pro).
- **Emisor:** `tickets`
- **Consumidores:** `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000015",
  "tipo": "ticket.escalado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor_ia",
    "id": "bot_wa_v1"
  },
  "timestamp": "2026-11-24T15:16:00Z",
  "datos": {
    "ticketId": "tkt_101",
    "folio": "TK-2026-000042",
    "nivelAnterior": "ia",
    "nivelNuevo": "asesor",
    "motivo": "El paciente solicitó confirmar preparación con un asesor humano",
    "asignadoAId": "usr_asesor_01"
  }
}
```

### `ticket.asignado` (v1)

- **Descripción:** Un ticket se asigna (o reasigna) a un asesor; automático por menor carga regional o manual.
- **Emisor:** `tickets`
- **Consumidores:** `timeline`, `realtime`, `metricas`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000021",
  "tipo": "ticket.asignado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T15:18:00Z",
  "datos": {
    "ticketId": "tkt_101",
    "folio": "TK-2026-000042",
    "asignadoAId": "usr_asesor_02",
    "asignadoAnteriorId": "usr_asesor_01",
    "nivel": "asesor",
    "automatico": false
  }
}
```

### `ticket.sla_vencido` (v1)

- **Descripción:** Alerta emitida por el job de SLA cuando un ticket excede su tiempo objetivo.
- **Emisor:** `tickets`
- **Consumidores:** `realtime`, `notificaciones`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000016",
  "tipo": "ticket.sla_vencido",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "sistema",
    "id": "sla-monitor"
  },
  "timestamp": "2026-11-24T19:16:00Z",
  "datos": {
    "ticketId": "tkt_101",
    "folio": "TK-2026-000042",
    "prioridad": "media",
    "region": "Puebla",
    "slaVenceEn": "2026-11-24T19:15:00Z"
  }
}
```

### `ticket.cerrado` (v1)

- **Descripción:** El ticket queda resuelto y cerrado con registro de tiempo de atención.
- **Emisor:** `tickets`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000017",
  "tipo": "ticket.cerrado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T15:21:00Z",
  "datos": {
    "ticketId": "tkt_101",
    "folio": "TK-2026-000042",
    "resolucion": "Duda de ayuno aclarada y cita confirmada en sistema",
    "tiempoResolucionMinutos": 6
  }
}
```

### `resultado.liberado` (v1)

- **Descripción:** Tras revisión técnica y validación médica, el resultado queda visible para el paciente.
- **Emisor:** `resultados`
- **Consumidores:** `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria`

```json
{
  "eventId": "10000000-0000-4000-8000-000000000018",
  "tipo": "resultado.liberado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "medico",
    "id": "usr_med_01"
  },
  "timestamp": "2026-11-26T18:30:00Z",
  "datos": {
    "resultadoId": "res_321",
    "estudioId": "est_us_abd",
    "validadoPorId": "usr_med_01",
    "canalNotificacion": "whatsapp"
  }
}
```

### `sesion.aviso_inactividad` (v1)

- **Descripción:** Único aviso de inactividad de la conversación: ya anuncia el cierre y cómo retomar (traspaso v2, sección 5).
- **Emisor:** `sesiones`
- **Consumidores:** `timeline`, `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000001",
  "tipo": "sesion.aviso_inactividad",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "sistema",
    "id": "temporizadores"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "sesion.aviso_inactividad:trm_456:1",
  "datos": {
    "canalConversacion": "whatsapp",
    "inactivoSegundos": 30,
    "cierreEnSegundos": 30,
    "perfilPlazos": "exposicion"
  }
}
```

### `contexto.transferido` (v1)

- **Descripción:** El trámite cambia de canal propietario (p. ej. WhatsApp → llamada); el canal anterior deja de escribir.
- **Emisor:** `canales`
- **Consumidores:** `timeline`, `realtime`, `metricas`, `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000002",
  "tipo": "contexto.transferido",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "operador",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "contexto.transferido:trm_456:2",
  "datos": {
    "folio": "SD-2026-000123",
    "canalAnterior": "whatsapp",
    "canalNuevo": "call_center",
    "versionNueva": 4,
    "propietarioHasta": "2026-11-24T15:02:20Z"
  }
}
```

### `canal.propietario_liberado` (v1)

- **Descripción:** El canal propietario deja el trámite (al colgar o por caducidad): cualquier canal puede retomarlo.
- **Emisor:** `canales`
- **Consumidores:** `timeline`, `realtime`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000003",
  "tipo": "canal.propietario_liberado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "sistema",
    "id": "temporizadores"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "canal.propietario_liberado:trm_456:3",
  "datos": {
    "folio": "SD-2026-000123",
    "canalLiberado": "call_center",
    "motivo": "caducado"
  }
}
```

### `cita.apartada` (v1)

- **Descripción:** Se aparta un horario sin confirmar; se libera si vence el plazo.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000004",
  "tipo": "cita.apartada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "paciente",
    "id": "pac_ana_demo"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "titular",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "cita.apartada:trm_456:4",
  "datos": {
    "folio": "SD-2026-000123",
    "clinicaId": "cli_pue_capu",
    "fechaHora": "2026-11-26T15:00:00Z",
    "apartadoHasta": "2026-11-24T14:12:00Z"
  }
}
```

### `cupo.liberado` (v1)

- **Descripción:** El horario apartado venció sin confirmar; al retomar se propone otro sin pedir datos.
- **Emisor:** `tramites`
- **Consumidores:** `timeline`, `realtime`, `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000005",
  "tipo": "cupo.liberado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "sistema",
    "id": "temporizadores"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "cupo.liberado:trm_456:5",
  "datos": {
    "folio": "SD-2026-000123",
    "clinicaId": "cli_pue_capu",
    "fechaHora": "2026-11-26T15:00:00Z"
  }
}
```

### `identidad.codigo_enviado` (v1)

- **Descripción:** Se envió un código de un solo uso; nunca incluye el código.
- **Emisor:** `otp`
- **Consumidores:** `timeline`, `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000006",
  "tipo": "identidad.codigo_enviado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "sistema",
    "id": "otp"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "identidad.codigo_enviado:trm_456:6",
  "datos": {
    "canalEnvio": "whatsapp",
    "venceEn": "2026-11-24T14:15:00Z"
  }
}
```

### `identidad.codigo_vencido` (v1)

- **Descripción:** El código venció sin usarse; antes de mostrar datos se pide uno nuevo.
- **Emisor:** `sesiones`
- **Consumidores:** `timeline`, `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000007",
  "tipo": "identidad.codigo_vencido",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "sistema",
    "id": "temporizadores"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "identidad.codigo_vencido:trm_456:7",
  "datos": {
    "canalEnvio": "whatsapp"
  }
}
```

### `enrutamiento.escalado` (v1)

- **Descripción:** La ruta por riesgo decidió que atienda una persona (Compartir, Escalar o Evitar).
- **Emisor:** `enrutamiento`
- **Consumidores:** `timeline`, `realtime`, `tickets`, `metricas`, `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000008",
  "tipo": "enrutamiento.escalado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor_ia",
    "id": "bot_whatsapp"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "bot",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "enrutamiento.escalado:trm_456:8",
  "datos": {
    "solicitud": "ree",
    "riesgo": 8,
    "ruta": "Evitar",
    "motivos": [
      "acceso de un tercero sin autorización"
    ],
    "compromisoSegundos": 120
  }
}
```

### `enrutamiento.atendido` (v1)

- **Descripción:** La ruta por riesgo permite resolver en autoservicio o con el bot (Aceptar o Reducir).
- **Emisor:** `enrutamiento`
- **Consumidores:** `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000009",
  "tipo": "enrutamiento.atendido",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "asesor_ia",
    "id": "bot_web"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "bot",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "enrutamiento.atendido:trm_456:9",
  "datos": {
    "solicitud": "cot",
    "riesgo": 4,
    "ruta": "Aceptar"
  }
}
```

### `acceso.consultado` (v1)

- **Descripción:** Alguien consultó el contexto de un paciente (bitácora de accesos, sin el contenido).
- **Emisor:** `canales`
- **Consumidores:** `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000010",
  "tipo": "acceso.consultado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "operador",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "acceso.consultado:trm_456:10",
  "datos": {
    "recurso": "contexto",
    "rolUsuario": "asesor"
  }
}
```

### `acceso.denegado` (v1)

- **Descripción:** Se negó una consulta por falta de verificación o de permiso.
- **Emisor:** `canales`
- **Consumidores:** `auditoria`, `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000011",
  "tipo": "acceso.denegado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor_ia",
    "id": "bot_whatsapp"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "bot",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "acceso.denegado:trm_456:11",
  "datos": {
    "recurso": "contexto",
    "motivo": "Sin verificación OTP vigente en el canal"
  }
}
```

### `resultado.valor_critico` (v1)

- **Descripción:** Un resultado con valor crítico: el bot queda bloqueado y una persona avisa (sin contenido en el evento).
- **Emisor:** `resultados`
- **Consumidores:** `timeline`, `realtime`, `tickets`, `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000012",
  "tipo": "resultado.valor_critico",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "medico",
    "id": "usr_med_01"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "personal_clinico",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "resultado.valor_critico:trm_456:12",
  "datos": {
    "resultadoId": "res_321",
    "estudioId": "est_us_abd"
  }
}
```

### `incidente.registrado` (v1)

- **Descripción:** Emergencia o incidente derivado a una persona; el trámite se pausa sin perder lo avanzado.
- **Emisor:** `enrutamiento`
- **Consumidores:** `timeline`, `realtime`, `tickets`, `auditoria`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000013",
  "tipo": "incidente.registrado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor_ia",
    "id": "bot_whatsapp"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "bot",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "incidente.registrado:trm_456:13",
  "datos": {
    "tipoIncidente": "emergencia",
    "descripcion": "Síntomas de alarma: se indicó llamar al 911 y se avisó a un supervisor"
  }
}
```

### `entrega.retrasada` (v1)

- **Descripción:** Un estudio de la orden no estará en la fecha comprometida (INC-O4-05): se informa la nueva fecha.
- **Emisor:** `resultados`
- **Consumidores:** `timeline`, `realtime`, `notificaciones`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000014",
  "tipo": "entrega.retrasada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "web",
  "actor": {
    "tipo": "sistema",
    "id": "laboratorio"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "entrega.retrasada:trm_456:14",
  "datos": {
    "ordenFolio": "SD-2026-000123",
    "estudioNombre": "Perfil tiroideo",
    "fechaComprometida": "2026-11-27T18:00:00Z",
    "causa": "Retraso del proveedor externo de análisis"
  }
}
```

### `seguimiento.correo_enviado` (v1)

- **Descripción:** Correo de seguimiento sin datos clínicos, con enlace personal que vence y pide código.
- **Emisor:** `seguimiento`
- **Consumidores:** `timeline`, `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000015",
  "tipo": "seguimiento.correo_enviado",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "email",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "operador",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "seguimiento.correo_enviado:trm_456:15",
  "datos": {
    "folio": "SD-2026-000123",
    "motivo": "Invitar a retomar donde se quedó",
    "enlaceVenceEn": "2026-11-27T14:00:00Z"
  }
}
```

### `seguimiento.plantilla_enviada` (v1)

- **Descripción:** Plantilla de WhatsApp enviada fuera de la ventana de 24 h (con costo).
- **Emisor:** `seguimiento`
- **Consumidores:** `timeline`, `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000016",
  "tipo": "seguimiento.plantilla_enviada",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "whatsapp",
  "actor": {
    "tipo": "asesor",
    "id": "usr_asesor_01"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "operador",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "seguimiento.plantilla_enviada:trm_456:16",
  "datos": {
    "folio": "SD-2026-000123",
    "plantilla": "sd_tramite_pendiente"
  }
}
```

### `compromiso.vencido` (v1)

- **Descripción:** Venció el compromiso de atención humana de la ruta (p. ej. una persona en menos de 2 min).
- **Emisor:** `sesiones`
- **Consumidores:** `timeline`, `realtime`, `tickets`, `metricas`

```json
{
  "eventId": "20000000-0000-4000-8000-000000000017",
  "tipo": "compromiso.vencido",
  "version": 1,
  "pacienteId": "pac_ana_demo",
  "tramiteId": "trm_456",
  "canal": "call_center",
  "actor": {
    "tipo": "sistema",
    "id": "temporizadores"
  },
  "timestamp": "2026-11-24T14:10:00Z",
  "ocurridoEn": "2026-11-24T14:10:00Z",
  "rolActor": "sistema",
  "versionTramite": 3,
  "correlacionId": "conv_wa_ana_01",
  "llaveIdempotencia": "compromiso.vencido:trm_456:17",
  "datos": {
    "ruta": "Escalar",
    "compromisoSegundos": 900
  }
}
```
