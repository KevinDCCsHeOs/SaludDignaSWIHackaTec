import en from './en.json';
import es from './es.json';

export type LocaleWeb = 'es' | 'en';
export type DiccionarioWeb = typeof es;

export const DICCIONARIOS_WEB: Record<LocaleWeb, DiccionarioWeb> = {
  es,
  en,
};

export function obtenerDiccionario(locale: LocaleWeb = 'es'): DiccionarioWeb {
  return DICCIONARIOS_WEB[locale] ?? es;
}
