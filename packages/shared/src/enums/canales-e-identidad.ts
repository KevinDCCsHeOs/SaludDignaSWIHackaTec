/**
 * Canales de atención soportados por la plataforma omnicanal.
 * Alineado con `CanalAtencion` en `apps/api/prisma/schema.prisma`.
 */
export const CANALES_ATENCION = [
  'web',
  'app',
  'whatsapp',
  'call_center',
  'email',
] as const;

export type CanalAtencion = (typeof CANALES_ATENCION)[number];

/**
 * Idiomas soportados para la atención al paciente (i18n).
 * Incluye español, inglés y náhuatl conforme a los problemas de comprensión del reto.
 */
export const IDIOMAS_PACIENTE = ['es', 'en', 'nah'] as const;

export type IdiomaPaciente = (typeof IDIOMAS_PACIENTE)[number];

/**
 * Roles de usuario y sistema (RBAC).
 * Alineado con `RolUsuario` en Prisma y la jerarquía definida en el issue #6.
 */
export const ROLES_USUARIO = [
  'paciente',
  'asesor_ia',
  'asesor',
  'asesor_pro',
  'medico',
  'revisor_tecnico',
  'admin',
] as const;

export type RolUsuario = (typeof ROLES_USUARIO)[number];

/**
 * Tipos de actor que originan una interacción o un evento de dominio.
 */
export const TIPOS_ACTOR = [
  'paciente',
  'asesor_ia',
  'asesor',
  'asesor_pro',
  'medico',
  'revisor_tecnico',
  'admin',
  'sistema',
] as const;

export type TipoActor = (typeof TIPOS_ACTOR)[number];

/**
 * Resultado posible al resolver una identidad entrante desde cualquier canal (#7, ADR 0006).
 */
export const ESTADOS_RESOLUCION_IDENTIDAD = [
  'conocido',
  'requiere_verificacion',
  'nuevo',
  'ambiguo',
] as const;

export type EstadoResolucionIdentidad =
  (typeof ESTADOS_RESOLUCION_IDENTIDAD)[number];
