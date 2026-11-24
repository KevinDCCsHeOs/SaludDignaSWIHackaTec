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
| `canal.cambiado` | v1 | `contexto` | `timeline`, `realtime`, `metricas` | El paciente continúa el mismo trámite desde un canal distinto al último usado. |
| `tramite.retomado` | v1 | `tramites` | `timeline`, `realtime`, `metricas` | Se reanuda un trámite pausado exactamente en el paso donde quedó. |
| `cita.agendada` | v1 | `tramites` | `timeline`, `realtime`, `notificaciones`, `metricas` | Se reserva fecha y hora para el estudio en la clínica elegida. |
| `cita.confirmada` | v1 | `tramites` | `timeline`, `realtime`, `notificaciones`, `metricas` | La cita queda confirmada y se notifica al paciente por su canal preferido/app. |
| `ticket.creado` | v1 | `tickets` | `timeline`, `realtime`, `tickets`, `metricas` | Se abre un ticket de atención con prioridad, región y fecha límite de SLA. |
| `ticket.escalado` | v1 | `tickets` | `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria` | Un ticket sube de nivel en la jerarquía del Contact Center (IA → asesor → asesor pro). |
| `ticket.sla_vencido` | v1 | `tickets` | `realtime`, `notificaciones`, `metricas` | Alerta emitida por el job de SLA cuando un ticket excede su tiempo objetivo. |
| `ticket.cerrado` | v1 | `tickets` | `timeline`, `realtime`, `metricas` | El ticket queda resuelto y cerrado con registro de tiempo de atención. |
| `resultado.liberado` | v1 | `resultados` | `timeline`, `realtime`, `notificaciones`, `metricas`, `auditoria` | Tras revisión técnica y validación médica, el resultado queda visible para el paciente. |

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
