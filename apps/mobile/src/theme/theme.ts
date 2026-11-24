import { TOKENS_UI } from '@salud-digna/ui';

export type EscalaFuente = 'normal' | 'grande' | 'extra_grande';

export const FACTOR_FUENTE: Record<EscalaFuente, number> = {
  normal: 1,
  grande: 1.2,
  extra_grande: 1.4,
};

export function obtenerPaleta(modoOscuro: boolean) {
  if (modoOscuro) {
    return {
      primario: '#10b981',
      fondo: '#0f172a',
      superficie: '#1e293b',
      borde: '#334155',
      texto: '#f8fafc',
      textoSecundario: '#cbd5e1',
      alertaFondo: '#451a03',
      alertaTexto: '#fde68a',
    };
  }
  return {
    primario: TOKENS_UI.colores.primario,
    fondo: TOKENS_UI.colores.fondo,
    superficie: TOKENS_UI.colores.superficie,
    borde: '#e2e8f0',
    texto: TOKENS_UI.colores.texto,
    textoSecundario: '#475569',
    alertaFondo: '#fffbeb',
    alertaTexto: '#92400e',
  };
}
