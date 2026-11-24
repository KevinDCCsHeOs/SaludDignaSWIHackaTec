/**
 * Tipos de ticket de soporte en el Contact Center (#16).
 */
export const TIPOS_TICKET = [
  'duda',
  'queja',
  'error_servicio',
  'acceso_cuenta',
  'informacion_incorrecta',
  'urgencia',
] as const;

export type TipoTicket = (typeof TIPOS_TICKET)[number];

/**
 * Prioridades de ticket con SLA asociado (#16, #25).
 */
export const PRIORIDADES_TICKET = ['baja', 'media', 'alta', 'critica'] as const;

export type PrioridadTicket = (typeof PRIORIDADES_TICKET)[number];

/**
 * SLA en minutos por prioridad de ticket.
 */
export const SLA_MINUTOS_POR_PRIORIDAD: Record<PrioridadTicket, number> = {
  critica: 15,
  alta: 60,
  media: 240,
  baja: 1440,
};

/**
 * Estatus del ciclo de vida de un ticket (#16).
 */
export const ESTATUS_TICKET = [
  'abierto',
  'en_atencion',
  'escalado',
  'resuelto',
  'cerrado',
] as const;

export type EstatusTicket = (typeof ESTATUS_TICKET)[number];

/**
 * Niveles de escalamiento del Contact Center: IA -> asesor -> asesor_pro.
 */
export const NIVELES_ESCALAMIENTO = ['ia', 'asesor', 'asesor_pro'] as const;

export type NivelEscalamiento = (typeof NIVELES_ESCALAMIENTO)[number];

/**
 * Estatus operativo de una clínica (#31).
 */
export const ESTATUS_CLINICA = [
  'operando',
  'retraso',
  'fuera_de_servicio',
] as const;

export type EstatusClinica = (typeof ESTATUS_CLINICA)[number];

/**
 * Categorías de estudios de diagnóstico ofrecidos en catálogo (#17).
 */
export const CATEGORIAS_ESTUDIO = [
  'laboratorio',
  'ultrasonido',
  'rayos_x',
  'mastografia',
  'papanicolaou',
  'electrocardiograma',
  'densitometria',
  'tomografia',
  'resonancia',
  'optometria',
  'nutricion',
  'otro',
] as const;

export type CategoriaEstudio = (typeof CATEGORIAS_ESTUDIO)[number];
