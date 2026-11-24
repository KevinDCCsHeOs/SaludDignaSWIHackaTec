import en from './en.json';
import es from './es.json';

export type LocaleMobile = 'es' | 'en';

export function obtenerTextosMobile(locale: LocaleMobile = 'es') {
  return locale === 'en' ? en : es;
}
