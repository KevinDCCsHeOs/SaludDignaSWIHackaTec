import { z } from 'zod';
import { CANALES_ATENCION, TIPOS_ACTOR } from '../enums/canales-e-identidad';

/**
 * Expresión regular obligatoria para la convención de nombres `dominio.accion`.
 * Ejemplos válidos: `clinica.seleccionada`, `ticket.sla_vencido`.
 */
export const PATRON_TIPO_EVENTO = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export const CanalAtencionSchema = z.enum(CANALES_ATENCION);

export const TipoActorSchema = z.enum(TIPOS_ACTOR);

/**
 * Actor que originó el evento de dominio.
 */
export const ActorEventoSchema = z.object({
  tipo: TipoActorSchema,
  id: z.string().min(1).max(64),
});

export type ActorEvento = z.infer<typeof ActorEventoSchema>;

/**
 * Rol con el que actuó el actor respecto al paciente (traspaso v2, principio "actor ≠ paciente").
 * Ej.: Ana actúa como `tutor` de Leo; el asesor actúa como `operador`.
 */
export const ROLES_ACTOR_EVENTO = [
  'titular',
  'tutor',
  'cuidador',
  'conyuge',
  'representante',
  'medico_referidor',
  'bot',
  'operador',
  'supervisor',
  'personal_clinico',
  'sistema',
] as const;

export type RolActorEvento = (typeof ROLES_ACTOR_EVENTO)[number];

/**
 * Sobre común obligatorio de todo evento omnicanal (#3).
 * Regla de versionado: cambios compatibles (campos opcionales nuevos) conservan `version`;
 * cambios incompatibles incrementan `version` (v2, v3, ...) y coexisten hasta migrar consumidores.
 */
export const EventoBaseSchema = z.object({
  eventId: z.string().uuid(),
  tipo: z.string().regex(PATRON_TIPO_EVENTO, {
    message: 'El tipo de evento debe seguir la convención dominio.accion',
  }),
  version: z.number().int().positive(),
  pacienteId: z.string().min(1).max(36).nullable(),
  tramiteId: z.string().min(1).max(36).nullable(),
  canal: CanalAtencionSchema,
  actor: ActorEventoSchema,
  timestamp: z.string().datetime({ offset: true }),
  /**
   * Hora del hecho (v2). Un vencimiento se registra a la hora del umbral, no a la hora en que se
   * detectó. Si falta, se usa `timestamp`.
   */
  ocurridoEn: z.string().datetime({ offset: true }).optional(),
  /** Rol con el que actuó el actor para este paciente (v2). */
  rolActor: z.enum(ROLES_ACTOR_EVENTO).optional(),
  /** Versión del trámite al momento del evento (canal propietario con versión, v2). */
  versionTramite: z.number().int().nonnegative().optional(),
  /** Agrupa los eventos de una misma atención o conversación (v2). */
  correlacionId: z.string().min(1).max(64).optional(),
  /** Llave única de la escritura: un reintento con la misma llave no duplica el evento (v2). */
  llaveIdempotencia: z.string().min(1).max(128).optional(),
});

export type EventoBase = z.infer<typeof EventoBaseSchema>;

/**
 * Consumidores internos oficiales en Redis Streams (ADR 0003, #14).
 */
export const CONSUMIDORES_EVENTOS = [
  'timeline',
  'realtime',
  'notificaciones',
  'metricas',
  'auditoria',
  'tickets',
] as const;

export type ConsumidorEvento = (typeof CONSUMIDORES_EVENTOS)[number];

/**
 * Emisores oficiales del catálogo de eventos.
 */
export const EMISORES_EVENTOS = [
  'identidad',
  'otp',
  'privacidad',
  'tramites',
  'contexto',
  'tickets',
  'resultados',
  'whatsapp-bot',
  'canales',
  'sesiones',
  'enrutamiento',
  'seguimiento',
] as const;

export type EmisorEvento = (typeof EMISORES_EVENTOS)[number];
