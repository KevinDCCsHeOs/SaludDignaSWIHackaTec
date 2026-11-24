import type { CanalAtencion, EventoOmnicanal } from '@salud-digna/shared';
import { META_CANAL_VISUAL, TOKENS_UI } from '@salud-digna/ui';

export const CANAL_MOBILE: CanalAtencion = 'app';

export interface ConfigAppMovil {
  canal: CanalAtencion;
  icono: string;
  colorPrimario: string;
  apiBaseUrl: string;
}

export function crearConfigAppMovil(apiBaseUrl = 'http://localhost:3000'): ConfigAppMovil {
  return {
    canal: CANAL_MOBILE,
    icono: META_CANAL_VISUAL[CANAL_MOBILE].icono,
    colorPrimario: TOKENS_UI.colores.primario,
    apiBaseUrl,
  };
}

export function esEventoDeApp(evento: EventoOmnicanal): boolean {
  return evento.canal === CANAL_MOBILE;
}
