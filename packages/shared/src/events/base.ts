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
] as const;

export type EmisorEvento = (typeof EMISORES_EVENTOS)[number];
