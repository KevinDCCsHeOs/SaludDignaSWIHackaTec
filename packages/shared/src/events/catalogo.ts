import { z } from 'zod';
import {
  ESTADOS_RESOLUCION_IDENTIDAD,
  ESTADOS_TRAMITE,
  IDIOMAS_PACIENTE,
  NIVELES_ESCALAMIENTO,
  PRIORIDADES_TICKET,
  TIPOS_CONSENTIMIENTO,
  TIPOS_TICKET,
  TIPOS_TRAMITE,
} from '../enums';
import { CanalAtencionSchema, ConsumidorEvento, EmisorEvento, EventoBaseSchema } from './base';

// ----------------------------------------------------------------------------
// Esquemas de `datos` por evento (`dominio.accion`, versión 1)
// ----------------------------------------------------------------------------

const PacienteRegistradoDatosSchema = z.object({
  registroLigero: z.boolean(),
  canalPreferido: CanalAtencionSchema,
  idioma: z.enum(IDIOMAS_PACIENTE),
  region: z.string().min(1).max(60).optional(),
  esDemo: z.boolean(),
});

const IdentidadResueltaDatosSchema = z.object({
  estadoResolucion: z.enum(ESTADOS_RESOLUCION_IDENTIDAD),
  canalOrigen: CanalAtencionSchema,
  coincidencias: z.number().int().nonnegative(),
});

const IdentidadVinculadaDatosSchema = z.object({
  identidadCanalId: z.string().min(1).max(36),
  canalVinculado: CanalAtencionSchema,
  metodoVerificacion: z.string().min(1).max(40),
});

const IdentidadVerificadaDatosSchema = z.object({
  metodo: z.enum([
    'otp_whatsapp',
    'otp_email',
    'otp_simulado',
    'preguntas_call_center',
    'login_password',
  ]),
  canalVerificado: CanalAtencionSchema,
  sesionValidaHasta: z.string().datetime({ offset: true }),
});

const ConsentimientoOtorgadoDatosSchema = z.object({
  consentimientoId: z.string().min(1).max(36),
  tipo: z.enum(TIPOS_CONSENTIMIENTO),
  versionAviso: z.string().min(1).max(32),
});

const CotizacionIniciadaDatosSchema = z.object({
  folio: z.string().min(1).max(32),
  tipoTramite: z.enum(TIPOS_TRAMITE),
  estudioId: z.string().min(1).max(36).optional(),
  region: z.string().min(1).max(60).optional(),
});

const EstudioSeleccionadoDatosSchema = z.object({
  estudioId: z.string().min(1).max(36),
  estudioNombre: z.string().min(1).max(160),
  precio: z.number().nonnegative(),
  requierePreparacion: z.boolean(),
});

const ClinicaSeleccionadaDatosSchema = z.object({
  clinicaId: z.string().min(1).max(36),
  clinicaNombre: z.string().min(1).max(160).optional(),
  estudioId: z.string().min(1).max(36).optional(),
  region: z.string().min(1).max(60).optional(),
});

const CitaAgendadaDatosSchema = z.object({
  citaId: z.string().min(1).max(36),
  clinicaId: z.string().min(1).max(36),
  fechaHora: z.string().datetime({ offset: true }),
  codigoConfirmacion: z.string().min(1).max(24).optional(),
});

const CitaConfirmadaDatosSchema = z.object({
  citaId: z.string().min(1).max(36),
  clinicaId: z.string().min(1).max(36),
  fechaHora: z.string().datetime({ offset: true }),
  confirmadaPorCanal: CanalAtencionSchema,
});

const TramitePausadoDatosSchema = z.object({
  folio: z.string().min(1).max(32),
  estadoPrevio: z.enum(ESTADOS_TRAMITE),
  pasoActual: z.string().min(1).max(60),
  pendientes: z.array(z.string().min(1).max(80)),
  motivo: z.string().min(1).max(200).optional(),
});

const TramiteRetomadoDatosSchema = z.object({
  folio: z.string().min(1).max(32),
  estadoRestaurado: z.enum(ESTADOS_TRAMITE),
  pasoActual: z.string().min(1).max(60),
  canalAnterior: CanalAtencionSchema,
  canalActual: CanalAtencionSchema,
});

const TramiteAvanzadoDatosSchema = z.object({
  folio: z.string().min(1).max(32),
  estadoAnterior: z.enum(ESTADOS_TRAMITE),
  estadoNuevo: z.enum(ESTADOS_TRAMITE),
  pasoActual: z.string().min(1).max(60),
});

const TramiteCanceladoDatosSchema = z.object({
  folio: z.string().min(1).max(32),
  estadoPrevio: z.enum(ESTADOS_TRAMITE),
  citaCancelada: z.boolean(),
  motivo: z.string().min(1).max(200).optional(),
});

const CanalCambiadoDatosSchema = z.object({
  canalAnterior: CanalAtencionSchema,
  canalNuevo: CanalAtencionSchema,
  pasoActual: z.string().min(1).max(60).optional(),
  verificado: z.boolean(),
});

const TicketCreadoDatosSchema = z.object({
  ticketId: z.string().min(1).max(36),
  folio: z.string().min(1).max(32),
  tipo: z.enum(TIPOS_TICKET),
  prioridad: z.enum(PRIORIDADES_TICKET),
  region: z.string().min(1).max(60),
  slaVenceEn: z.string().datetime({ offset: true }),
});

const TicketEscaladoDatosSchema = z.object({
  ticketId: z.string().min(1).max(36),
  folio: z.string().min(1).max(32),
  nivelAnterior: z.enum(NIVELES_ESCALAMIENTO),
  nivelNuevo: z.enum(NIVELES_ESCALAMIENTO),
  motivo: z.string().min(1).max(255),
  asignadoAId: z.string().min(1).max(36).nullable(),
});

const TicketAsignadoDatosSchema = z.object({
  ticketId: z.string().min(1).max(36),
  folio: z.string().min(1).max(32),
  asignadoAId: z.string().min(1).max(36),
  asignadoAnteriorId: z.string().min(1).max(36).nullable(),
  nivel: z.enum(NIVELES_ESCALAMIENTO),
  automatico: z.boolean(),
});

const TicketSlaVencidoDatosSchema = z.object({
  ticketId: z.string().min(1).max(36),
  folio: z.string().min(1).max(32),
  prioridad: z.enum(PRIORIDADES_TICKET),
  region: z.string().min(1).max(60),
  slaVenceEn: z.string().datetime({ offset: true }),
});

const TicketCerradoDatosSchema = z.object({
  ticketId: z.string().min(1).max(36),
  folio: z.string().min(1).max(32),
  resolucion: z.string().min(1).max(255),
  tiempoResolucionMinutos: z.number().nonnegative(),
});

const ResultadoLiberadoDatosSchema = z.object({
  resultadoId: z.string().min(1).max(36),
  estudioId: z.string().min(1).max(36),
  validadoPorId: z.string().min(1).max(36),
  canalNotificacion: CanalAtencionSchema,
});

// ----------------------------------------------------------------------------
// Esquemas completos por evento (sobre común + tipo literal + versión + datos)
// ----------------------------------------------------------------------------

function crearEsquemaEvento<TTipo extends string, TDatos extends z.ZodTypeAny>(
  tipo: TTipo,
  version: 1,
  datosSchema: TDatos,
) {
  return EventoBaseSchema.extend({
    tipo: z.literal(tipo),
    version: z.literal(version),
    datos: datosSchema,
  });
}

export const PacienteRegistradoEventoSchema = crearEsquemaEvento(
  'paciente.registrado',
  1,
  PacienteRegistradoDatosSchema,
);
export const IdentidadResueltaEventoSchema = crearEsquemaEvento(
  'identidad.resuelta',
  1,
  IdentidadResueltaDatosSchema,
);
export const IdentidadVinculadaEventoSchema = crearEsquemaEvento(
  'identidad.vinculada',
  1,
  IdentidadVinculadaDatosSchema,
);
export const IdentidadVerificadaEventoSchema = crearEsquemaEvento(
  'identidad.verificada',
  1,
  IdentidadVerificadaDatosSchema,
);
export const ConsentimientoOtorgadoEventoSchema = crearEsquemaEvento(
  'consentimiento.otorgado',
  1,
  ConsentimientoOtorgadoDatosSchema,
);
export const CotizacionIniciadaEventoSchema = crearEsquemaEvento(
  'cotizacion.iniciada',
  1,
  CotizacionIniciadaDatosSchema,
);
export const EstudioSeleccionadoEventoSchema = crearEsquemaEvento(
  'estudio.seleccionado',
  1,
  EstudioSeleccionadoDatosSchema,
);
export const ClinicaSeleccionadaEventoSchema = crearEsquemaEvento(
  'clinica.seleccionada',
  1,
  ClinicaSeleccionadaDatosSchema,
);
export const CitaAgendadaEventoSchema = crearEsquemaEvento(
  'cita.agendada',
  1,
  CitaAgendadaDatosSchema,
);
export const CitaConfirmadaEventoSchema = crearEsquemaEvento(
  'cita.confirmada',
  1,
  CitaConfirmadaDatosSchema,
);
export const TramitePausadoEventoSchema = crearEsquemaEvento(
  'tramite.pausado',
  1,
  TramitePausadoDatosSchema,
);
export const TramiteRetomadoEventoSchema = crearEsquemaEvento(
  'tramite.retomado',
  1,
  TramiteRetomadoDatosSchema,
);
export const TramiteAvanzadoEventoSchema = crearEsquemaEvento(
  'tramite.avanzado',
  1,
  TramiteAvanzadoDatosSchema,
);
export const TramiteCanceladoEventoSchema = crearEsquemaEvento(
  'tramite.cancelado',
  1,
  TramiteCanceladoDatosSchema,
);
export const CanalCambiadoEventoSchema = crearEsquemaEvento(
  'canal.cambiado',
  1,
  CanalCambiadoDatosSchema,
);
export const TicketCreadoEventoSchema = crearEsquemaEvento(
  'ticket.creado',
  1,
  TicketCreadoDatosSchema,
);
export const TicketEscaladoEventoSchema = crearEsquemaEvento(
  'ticket.escalado',
  1,
  TicketEscaladoDatosSchema,
);
export const TicketAsignadoEventoSchema = crearEsquemaEvento(
  'ticket.asignado',
  1,
  TicketAsignadoDatosSchema,
);
export const TicketSlaVencidoEventoSchema = crearEsquemaEvento(
  'ticket.sla_vencido',
  1,
  TicketSlaVencidoDatosSchema,
);
export const TicketCerradoEventoSchema = crearEsquemaEvento(
  'ticket.cerrado',
  1,
  TicketCerradoDatosSchema,
);
export const ResultadoLiberadoEventoSchema = crearEsquemaEvento(
  'resultado.liberado',
  1,
  ResultadoLiberadoDatosSchema,
);

/**
 * Unión discriminada de todos los eventos oficiales del catálogo omnicanal.
 */
export const EventoOmnicanalSchema = z.discriminatedUnion('tipo', [
  PacienteRegistradoEventoSchema,
  IdentidadResueltaEventoSchema,
  IdentidadVinculadaEventoSchema,
  IdentidadVerificadaEventoSchema,
  ConsentimientoOtorgadoEventoSchema,
  CotizacionIniciadaEventoSchema,
  EstudioSeleccionadoEventoSchema,
  ClinicaSeleccionadaEventoSchema,
  CitaAgendadaEventoSchema,
  CitaConfirmadaEventoSchema,
  TramitePausadoEventoSchema,
  TramiteRetomadoEventoSchema,
  TramiteAvanzadoEventoSchema,
  TramiteCanceladoEventoSchema,
  CanalCambiadoEventoSchema,
  TicketCreadoEventoSchema,
  TicketEscaladoEventoSchema,
  TicketAsignadoEventoSchema,
  TicketSlaVencidoEventoSchema,
  TicketCerradoEventoSchema,
  ResultadoLiberadoEventoSchema,
]);

export type EventoOmnicanal = z.infer<typeof EventoOmnicanalSchema>;
export type TipoEventoOmnicanal = EventoOmnicanal['tipo'];

export interface DefinicionEventoCatalogo<TEvento extends EventoOmnicanal = EventoOmnicanal> {
  tipo: TEvento['tipo'];
  version: number;
  dominio: string;
  descripcion: string;
  emisor: EmisorEvento;
  consumidores: readonly ConsumidorEvento[];
  schema: z.ZodType<TEvento>;
  ejemplo: TEvento;
}

/**
 * Fuente única de verdad para validación y generación automática de `docs/eventos.md` (#3).
 * Todos los datos de ejemplo son 100% ficticios (escenario demo de Ana López).
 */
export const CATALOGO_EVENTOS: readonly DefinicionEventoCatalogo[] = [
  {
    tipo: 'paciente.registrado',
    version: 1,
    dominio: 'paciente',
    descripcion: 'Alta inicial o registro ligero de un paciente ficticio en cualquier canal.',
    emisor: 'identidad',
    consumidores: ['timeline', 'metricas', 'auditoria'],
    schema: PacienteRegistradoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000001',
      tipo: 'paciente.registrado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: null,
      canal: 'web',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T10:10:00Z',
      datos: {
        registroLigero: true,
        canalPreferido: 'whatsapp',
        idioma: 'es',
        region: 'Puebla',
        esDemo: true,
      },
    },
  },
  {
    tipo: 'identidad.resuelta',
    version: 1,
    dominio: 'identidad',
    descripcion: 'Resultado de buscar un identificador normalizado al entrar desde un canal.',
    emisor: 'identidad',
    consumidores: ['metricas', 'auditoria'],
    schema: IdentidadResueltaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000002',
      tipo: 'identidad.resuelta',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: null,
      canal: 'whatsapp',
      actor: { tipo: 'sistema', id: 'identity-resolver' },
      timestamp: '2026-11-24T14:00:00Z',
      datos: {
        estadoResolucion: 'requiere_verificacion',
        canalOrigen: 'whatsapp',
        coincidencias: 1,
      },
    },
  },
  {
    tipo: 'identidad.vinculada',
    version: 1,
    dominio: 'identidad',
    descripcion: 'Se vincula una nueva IdentidadCanal al paciente tras verificar titularidad.',
    emisor: 'identidad',
    consumidores: ['timeline', 'auditoria'],
    schema: IdentidadVinculadaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000003',
      tipo: 'identidad.vinculada',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: null,
      canal: 'whatsapp',
      actor: { tipo: 'sistema', id: 'identity-resolver' },
      timestamp: '2026-11-24T14:02:00Z',
      datos: {
        identidadCanalId: 'idc_wa_ana_01',
        canalVinculado: 'whatsapp',
        metodoVerificacion: 'otp_whatsapp',
      },
    },
  },
  {
    tipo: 'identidad.verificada',
    version: 1,
    dominio: 'identidad',
    descripcion:
      'El paciente supera OTP o preguntas de seguridad; se habilita revelar su contexto.',
    emisor: 'otp',
    consumidores: ['timeline', 'realtime', 'auditoria'],
    schema: IdentidadVerificadaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000004',
      tipo: 'identidad.verificada',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'whatsapp',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T14:02:05Z',
      datos: {
        metodo: 'otp_whatsapp',
        canalVerificado: 'whatsapp',
        sesionValidaHasta: '2026-11-24T14:32:05Z',
      },
    },
  },
  {
    tipo: 'consentimiento.otorgado',
    version: 1,
    dominio: 'consentimiento',
    descripcion: 'El paciente acepta el aviso de privacidad o uso de datos sensibles (LFPDPPP).',
    emisor: 'privacidad',
    consumidores: ['timeline', 'auditoria'],
    schema: ConsentimientoOtorgadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000005',
      tipo: 'consentimiento.otorgado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: null,
      canal: 'web',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T10:10:30Z',
      datos: {
        consentimientoId: 'con_001',
        tipo: 'aviso_privacidad',
        versionAviso: 'v1.0-2026',
      },
    },
  },
  {
    tipo: 'cotizacion.iniciada',
    version: 1,
    dominio: 'cotizacion',
    descripcion: 'Se crea un nuevo trámite con folio legible en estado inicial de cotización.',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: CotizacionIniciadaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000006',
      tipo: 'cotizacion.iniciada',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'web',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T10:12:00Z',
      datos: {
        folio: 'SD-2026-000123',
        tipoTramite: 'estudio',
        estudioId: 'est_us_abd',
        region: 'Puebla',
      },
    },
  },
  {
    tipo: 'estudio.seleccionado',
    version: 1,
    dominio: 'estudio',
    descripcion: 'El paciente elige el estudio a realizar y se autoguarda en el contexto.',
    emisor: 'contexto',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: EstudioSeleccionadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000007',
      tipo: 'estudio.seleccionado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'web',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T10:13:00Z',
      datos: {
        estudioId: 'est_us_abd',
        estudioNombre: 'Ultrasonido abdominal',
        precio: 450,
        requierePreparacion: true,
      },
    },
  },
  {
    tipo: 'clinica.seleccionada',
    version: 1,
    dominio: 'clinica',
    descripcion:
      'El paciente selecciona clínica y el contexto persiste el avance antes de confirmar.',
    emisor: 'contexto',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: ClinicaSeleccionadaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000008',
      tipo: 'clinica.seleccionada',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'web',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T10:15:00Z',
      datos: {
        clinicaId: 'cli_09',
        clinicaNombre: 'Salud Digna Puebla Centro',
        estudioId: 'est_us_abd',
        region: 'Puebla',
      },
    },
  },
  {
    tipo: 'tramite.pausado',
    version: 1,
    dominio: 'tramite',
    descripcion: 'El trámite queda pausado conservando estado previo y datos pendientes.',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: TramitePausadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000009',
      tipo: 'tramite.pausado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'web',
      actor: { tipo: 'sistema', id: 'contexto-timeout' },
      timestamp: '2026-11-24T10:45:00Z',
      datos: {
        folio: 'SD-2026-000123',
        estadoPrevio: 'seleccion_clinica',
        pasoActual: 'seleccion_clinica',
        pendientes: ['confirmar_fecha', 'aceptar_preparacion'],
        motivo: 'Inactividad en sesión web',
      },
    },
  },
  {
    tipo: 'tramite.avanzado',
    version: 1,
    dominio: 'tramite',
    descripcion:
      'Transición genérica de la máquina de estados sin evento de dominio específico (ej. registro, pago, en proceso, cierre).',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: TramiteAvanzadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000019',
      tipo: 'tramite.avanzado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'call_center',
      actor: { tipo: 'asesor', id: 'usr_asesor_01' },
      timestamp: '2026-11-24T16:05:00Z',
      datos: {
        folio: 'SD-2026-000123',
        estadoAnterior: 'cita_confirmada',
        estadoNuevo: 'pago_factura',
        pasoActual: 'pago_factura',
      },
    },
  },
  {
    tipo: 'tramite.cancelado',
    version: 1,
    dominio: 'tramite',
    descripcion: 'El trámite se cancela (estado terminal) y, si existía, se cancela su cita.',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'notificaciones', 'metricas'],
    schema: TramiteCanceladoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000020',
      tipo: 'tramite.cancelado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'app',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-25T08:00:00Z',
      datos: {
        folio: 'SD-2026-000123',
        estadoPrevio: 'cita_agendada',
        citaCancelada: true,
        motivo: 'La paciente reprogramará más adelante',
      },
    },
  },
  {
    tipo: 'canal.cambiado',
    version: 1,
    dominio: 'canal',
    descripcion: 'El paciente continúa el mismo trámite desde un canal distinto al último usado.',
    emisor: 'contexto',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: CanalCambiadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000010',
      tipo: 'canal.cambiado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'whatsapp',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T14:02:10Z',
      datos: {
        canalAnterior: 'web',
        canalNuevo: 'whatsapp',
        pasoActual: 'seleccion_clinica',
        verificado: true,
      },
    },
  },
  {
    tipo: 'tramite.retomado',
    version: 1,
    dominio: 'tramite',
    descripcion: 'Se reanuda un trámite pausado exactamente en el paso donde quedó.',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: TramiteRetomadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000011',
      tipo: 'tramite.retomado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'whatsapp',
      actor: { tipo: 'asesor_ia', id: 'bot_wa_v1' },
      timestamp: '2026-11-24T14:02:15Z',
      datos: {
        folio: 'SD-2026-000123',
        estadoRestaurado: 'seleccion_clinica',
        pasoActual: 'seleccion_clinica',
        canalAnterior: 'web',
        canalActual: 'whatsapp',
      },
    },
  },
  {
    tipo: 'cita.agendada',
    version: 1,
    dominio: 'cita',
    descripcion: 'Se reserva fecha y hora para el estudio en la clínica elegida.',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'notificaciones', 'metricas'],
    schema: CitaAgendadaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000012',
      tipo: 'cita.agendada',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'whatsapp',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      timestamp: '2026-11-24T14:05:00Z',
      datos: {
        citaId: 'cit_789',
        clinicaId: 'cli_09',
        fechaHora: '2026-11-26T09:00:00Z',
        codigoConfirmacion: 'SD9K2M',
      },
    },
  },
  {
    tipo: 'cita.confirmada',
    version: 1,
    dominio: 'cita',
    descripcion: 'La cita queda confirmada y se notifica al paciente por su canal preferido/app.',
    emisor: 'tramites',
    consumidores: ['timeline', 'realtime', 'notificaciones', 'metricas'],
    schema: CitaConfirmadaEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000013',
      tipo: 'cita.confirmada',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'call_center',
      actor: { tipo: 'asesor', id: 'usr_asesor_01' },
      timestamp: '2026-11-24T15:20:00Z',
      datos: {
        citaId: 'cit_789',
        clinicaId: 'cli_09',
        fechaHora: '2026-11-26T09:00:00Z',
        confirmadaPorCanal: 'call_center',
      },
    },
  },
  {
    tipo: 'ticket.creado',
    version: 1,
    dominio: 'ticket',
    descripcion: 'Se abre un ticket de atención con prioridad, región y fecha límite de SLA.',
    emisor: 'tickets',
    consumidores: ['timeline', 'realtime', 'tickets', 'metricas'],
    schema: TicketCreadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000014',
      tipo: 'ticket.creado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'call_center',
      actor: { tipo: 'asesor', id: 'usr_asesor_01' },
      timestamp: '2026-11-24T15:15:00Z',
      datos: {
        ticketId: 'tkt_101',
        folio: 'TK-2026-000042',
        tipo: 'duda',
        prioridad: 'media',
        region: 'Puebla',
        slaVenceEn: '2026-11-24T19:15:00Z',
      },
    },
  },
  {
    tipo: 'ticket.escalado',
    version: 1,
    dominio: 'ticket',
    descripcion:
      'Un ticket sube de nivel en la jerarquía del Contact Center (IA → asesor → asesor pro).',
    emisor: 'tickets',
    consumidores: ['timeline', 'realtime', 'notificaciones', 'metricas', 'auditoria'],
    schema: TicketEscaladoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000015',
      tipo: 'ticket.escalado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'whatsapp',
      actor: { tipo: 'asesor_ia', id: 'bot_wa_v1' },
      timestamp: '2026-11-24T15:16:00Z',
      datos: {
        ticketId: 'tkt_101',
        folio: 'TK-2026-000042',
        nivelAnterior: 'ia',
        nivelNuevo: 'asesor',
        motivo: 'El paciente solicitó confirmar preparación con un asesor humano',
        asignadoAId: 'usr_asesor_01',
      },
    },
  },
  {
    tipo: 'ticket.asignado',
    version: 1,
    dominio: 'ticket',
    descripcion:
      'Un ticket se asigna (o reasigna) a un asesor; automático por menor carga regional o manual.',
    emisor: 'tickets',
    consumidores: ['timeline', 'realtime', 'metricas', 'auditoria'],
    schema: TicketAsignadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000021',
      tipo: 'ticket.asignado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'whatsapp',
      actor: { tipo: 'asesor', id: 'usr_asesor_01' },
      timestamp: '2026-11-24T15:18:00Z',
      datos: {
        ticketId: 'tkt_101',
        folio: 'TK-2026-000042',
        asignadoAId: 'usr_asesor_02',
        asignadoAnteriorId: 'usr_asesor_01',
        nivel: 'asesor',
        automatico: false,
      },
    },
  },
  {
    tipo: 'ticket.sla_vencido',
    version: 1,
    dominio: 'ticket',
    descripcion: 'Alerta emitida por el job de SLA cuando un ticket excede su tiempo objetivo.',
    emisor: 'tickets',
    consumidores: ['realtime', 'notificaciones', 'metricas'],
    schema: TicketSlaVencidoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000016',
      tipo: 'ticket.sla_vencido',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'call_center',
      actor: { tipo: 'sistema', id: 'sla-monitor' },
      timestamp: '2026-11-24T19:16:00Z',
      datos: {
        ticketId: 'tkt_101',
        folio: 'TK-2026-000042',
        prioridad: 'media',
        region: 'Puebla',
        slaVenceEn: '2026-11-24T19:15:00Z',
      },
    },
  },
  {
    tipo: 'ticket.cerrado',
    version: 1,
    dominio: 'ticket',
    descripcion: 'El ticket queda resuelto y cerrado con registro de tiempo de atención.',
    emisor: 'tickets',
    consumidores: ['timeline', 'realtime', 'metricas'],
    schema: TicketCerradoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000017',
      tipo: 'ticket.cerrado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'call_center',
      actor: { tipo: 'asesor', id: 'usr_asesor_01' },
      timestamp: '2026-11-24T15:21:00Z',
      datos: {
        ticketId: 'tkt_101',
        folio: 'TK-2026-000042',
        resolucion: 'Duda de ayuno aclarada y cita confirmada en sistema',
        tiempoResolucionMinutos: 6,
      },
    },
  },
  {
    tipo: 'resultado.liberado',
    version: 1,
    dominio: 'resultado',
    descripcion:
      'Tras revisión técnica y validación médica, el resultado queda visible para el paciente.',
    emisor: 'resultados',
    consumidores: ['timeline', 'realtime', 'notificaciones', 'metricas', 'auditoria'],
    schema: ResultadoLiberadoEventoSchema,
    ejemplo: {
      eventId: '10000000-0000-4000-8000-000000000018',
      tipo: 'resultado.liberado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: 'trm_456',
      canal: 'web',
      actor: { tipo: 'medico', id: 'usr_med_01' },
      timestamp: '2026-11-26T18:30:00Z',
      datos: {
        resultadoId: 'res_321',
        estudioId: 'est_us_abd',
        validadoPorId: 'usr_med_01',
        canalNotificacion: 'whatsapp',
      },
    },
  },
] as const;

export const TIPOS_EVENTO = CATALOGO_EVENTOS.map((e) => e.tipo);

/**
 * Valida un payload desconocido contra el catálogo de eventos omnicanal.
 */
export function validarEventoOmnicanal(payload: unknown): EventoOmnicanal {
  return EventoOmnicanalSchema.parse(payload);
}

/**
 * Validación segura (sin lanzar excepción) para webhooks, colas y consumidores.
 */
export function validarEventoOmnicanalSeguro(payload: unknown) {
  return EventoOmnicanalSchema.safeParse(payload);
}
