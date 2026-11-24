import type { CanalAtencion, EstadoTramite, TipoActor } from '@salud-digna/shared';

/**
 * Tokens visuales base para mantener consistencia entre `apps/web` y `apps/mobile`.
 */
export const TOKENS_UI = {
  colores: {
    primario: '#0b6e4f',
    secundario: '#1d4ed8',
    superficie: '#ffffff',
    fondo: '#f8fafc',
    texto: '#0f172a',
    alerta: '#b45309',
    critico: '#dc2626',
  },
} as const;

export interface MetaCanalVisual {
  clave: CanalAtencion;
  icono: string;
  color: string;
  claveI18n: string;
}

/**
 * Metadatos visuales por canal (textos visibles delegados a claves i18n).
 */
export const META_CANAL_VISUAL: Record<CanalAtencion, MetaCanalVisual> = {
  web: { clave: 'web', icono: 'globe', color: '#1d4ed8', claveI18n: 'canales.web' },
  app: { clave: 'app', icono: 'smartphone', color: '#7c3aed', claveI18n: 'canales.app' },
  whatsapp: {
    clave: 'whatsapp',
    icono: 'message-circle',
    color: '#15803d',
    claveI18n: 'canales.whatsapp',
  },
  call_center: {
    clave: 'call_center',
    icono: 'phone',
    color: '#b45309',
    claveI18n: 'canales.call_center',
  },
  email: { clave: 'email', icono: 'mail', color: '#475569', claveI18n: 'canales.email' },
};

/**
 * Contrato de entrada para el componente reutilizable `<Timeline />` (#15).
 */
export interface EntradaTimelineVisual {
  eventId: string;
  fecha: string;
  canal: CanalAtencion;
  actorTipo: TipoActor;
  claveAccionI18n: string;
  estadoResultante?: EstadoTramite;
}
