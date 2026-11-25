import type { IdiomaPaciente } from '@salud-digna/shared';

const PATRON_NAHUATL =
  /\b(niltze|pialli|cualli\s+tonalli|kuali\s+tonali|tlazohcamati|tlasojkamati|n[aá]huatl|macehualli|nitlahtoa|tlen\s+timonequi|ken\s+tikah|qualli\s+tonalli)\b/i;

const PALABRAS_INGLES = [
  'hello',
  'hi',
  'good morning',
  'good afternoon',
  'good evening',
  'how much',
  'price',
  'cost',
  'quote',
  'appointment',
  'schedule',
  'book',
  'reschedule',
  'status',
  'results',
  'result',
  'lab',
  'ultrasound',
  'blood test',
  'x-ray',
  'xray',
  'clinic',
  'location',
  'address',
  'where is',
  'complaint',
  'terrible',
  'rude',
  'password',
  'login',
  'log in',
  'sign in',
  'account',
  'cannot access',
  'cant access',
  "can't access",
  'chest pain',
  "can't breathe",
  'cant breathe',
  'bleeding',
  'fainted',
  'emergency',
  'advisor',
  'human',
  'agent',
  'representative',
  'explain',
  'simple',
  'plain',
  'what is',
  'fasting',
  'please',
  'thank you',
  'thanks',
  'help me',
  'need',
  'want',
  'my',
  'tomorrow',
  'today',
];

const PALABRAS_ESPANOL = [
  'hola',
  'buenos',
  'buenas',
  'cuanto',
  'cuánto',
  'cuesta',
  'precio',
  'cotizar',
  'cotización',
  'cotizacion',
  'cita',
  'agendar',
  'horario',
  'mañana',
  'manana',
  'estatus',
  'estado',
  'trámite',
  'tramite',
  'resultados',
  'resultado',
  'clínica',
  'clinica',
  'ubicación',
  'ubicacion',
  'dirección',
  'direccion',
  'dónde',
  'donde',
  'queja',
  'molesto',
  'pésimo',
  'pesimo',
  'cuenta',
  'contraseña',
  'contrasena',
  'entrar',
  'dolor',
  'pecho',
  'respirar',
  'sangrado',
  'desmayo',
  'asesor',
  'humano',
  'explícame',
  'explicame',
  'entiendo',
  'ayuno',
  'estudio',
  'ultrasonido',
  'quiero',
  'necesito',
  'gracias',
  'por favor',
];

/**
 * Detecta el idioma principal del mensaje del paciente (`es`, `en` o `nah`) (#26).
 * Si el texto es ambiguo (ej. un código OTP numérico), conserva `idiomaActual`.
 */
export function detectarIdiomaMensaje(
  texto: string,
  idiomaActual: IdiomaPaciente = 'es',
): { idioma: IdiomaPaciente; detectadoConCerteza: boolean } {
  const limpio = texto.trim();
  if (!limpio || /^[\d\s\-+.,:/]+$/.test(limpio)) {
    return { idioma: idiomaActual, detectadoConCerteza: false };
  }

  if (PATRON_NAHUATL.test(limpio)) {
    return { idioma: 'nah', detectadoConCerteza: true };
  }

  const lower = limpio.toLowerCase();
  let puntosEn = 0;
  let puntosEs = 0;

  for (const w of PALABRAS_INGLES) {
    const regex = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) puntosEn += w.includes(' ') ? 2 : 1;
  }

  for (const w of PALABRAS_ESPANOL) {
    const regex = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) puntosEs += w.includes(' ') ? 2 : 1;
  }

  // Signos propios del español (¿, ¡, ñ, acentos) refuerzan español
  if (/[¿¡ñáéíóúü]/i.test(limpio)) {
    puntosEs += 2;
  }

  if (puntosEn > 0 && puntosEn > puntosEs) {
    return { idioma: 'en', detectadoConCerteza: true };
  }
  if (puntosEs > 0 && puntosEs >= puntosEn) {
    return { idioma: 'es', detectadoConCerteza: true };
  }

  return { idioma: idiomaActual, detectadoConCerteza: false };
}
