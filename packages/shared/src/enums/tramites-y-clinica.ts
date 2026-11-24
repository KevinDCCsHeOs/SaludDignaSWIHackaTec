/**
 * Tipos de trámite soportados en la plataforma.
 */
export const TIPOS_TRAMITE = ['estudio', 'resultado', 'factura'] as const;

export type TipoTramite = (typeof TIPOS_TRAMITE)[number];

/**
 * Estados de la máquina de estados del trámite (#12).
 * Flujo principal: cotizacion -> registro -> seleccion_clinica -> cita_agendada
 * -> cita_confirmada -> pago_factura -> en_proceso -> resultados_liberados -> cerrado.
 */
export const ESTADOS_TRAMITE = [
  'cotizacion',
  'registro',
  'seleccion_clinica',
  'cita_agendada',
  'cita_confirmada',
  'pago_factura',
  'en_proceso',
  'resultados_liberados',
  'cerrado',
  'pausado',
  'cancelado',
] as const;

export type EstadoTramite = (typeof ESTADOS_TRAMITE)[number];

/**
 * Estatus individual de cada paso registrado en `PasoTramite`.
 */
export const ESTATUS_PASO_TRAMITE = [
  'pendiente',
  'en_progreso',
  'completado',
  'omitido',
  'fallido',
] as const;

export type EstatusPasoTramite = (typeof ESTATUS_PASO_TRAMITE)[number];

/**
 * Estatus del ciclo de vida de una cita en clínica.
 */
export const ESTATUS_CITA = [
  'agendada',
  'confirmada',
  'en_curso',
  'completada',
  'reprogramada',
  'cancelada',
  'no_asistio',
] as const;

export type EstatusCita = (typeof ESTATUS_CITA)[number];

/**
 * Jerarquía de liberación de resultados clínicos (#30).
 * Un resultado solo es visible para el paciente cuando alcanza `liberado`.
 */
export const ESTATUS_RESULTADO = [
  'captura',
  'revision_tecnica',
  'validacion_medica',
  'liberado',
  'rechazado',
] as const;

export type EstatusResultado = (typeof ESTATUS_RESULTADO)[number];
