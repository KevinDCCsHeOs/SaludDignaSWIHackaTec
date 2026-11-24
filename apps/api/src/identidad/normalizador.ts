import type { CanalAtencion } from '@salud-digna/shared';

const REGEX_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TipoIdentificadorDetectado = 'telefono' | 'email' | 'curp' | 'externo';

export interface IdentificadorNormalizado {
  tipo: TipoIdentificadorDetectado;
  valor: string;
}

/**
 * Normaliza números mexicanos y extranjeros a formato E.164 (#7, ADR 0006).
 * Ejemplos soportados:
 * - `2221234567` -> `+522221234567`
 * - `(222) 123-4567` -> `+522221234567`
 * - `+52 1 222 123 4567` -> `+522221234567` (quita el prefijo móvil `1` obsoleto en MX)
 * - `5212221234567` -> `+522221234567`
 */
export function normalizarTelefonoE164(raw: string): string {
  const limpio = raw.trim();
  const tieneMas = limpio.startsWith('+');
  const digitos = limpio.replace(/\D/g, '');

  if (digitos.length === 10) {
    return `+52${digitos}`;
  }
  if (digitos.length === 12 && digitos.startsWith('52')) {
    return `+${digitos}`;
  }
  if (digitos.length === 13 && digitos.startsWith('521')) {
    return `+52${digitos.slice(3)}`;
  }
  if (tieneMas && digitos.length >= 10 && digitos.length <= 15) {
    return `+${digitos}`;
  }
  if (digitos.length >= 11 && digitos.length <= 15) {
    return `+${digitos}`;
  }

  throw new Error('Formato de teléfono inválido para normalización E.164');
}

export function normalizarEmail(raw: string): string {
  const limpio = raw.trim().toLowerCase();
  if (!REGEX_EMAIL.test(limpio)) {
    throw new Error('Formato de correo electrónico inválido');
  }
  return limpio;
}

export function normalizarCurp(raw: string): string {
  const limpio = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!REGEX_CURP.test(limpio)) {
    throw new Error('Formato de CURP inválido (se esperan 18 caracteres oficiales)');
  }
  return limpio;
}

export function normalizarIdentificador(
  canal: CanalAtencion,
  identificadorRaw: string,
): IdentificadorNormalizado {
  const limpio = identificadorRaw.trim();
  if (!limpio) {
    throw new Error('El identificador no puede estar vacío');
  }

  if (canal === 'email' || limpio.includes('@')) {
    return { tipo: 'email', valor: normalizarEmail(limpio) };
  }

  const posibleCurp = limpio.toUpperCase().replace(/\s+/g, '');
  if (REGEX_CURP.test(posibleCurp)) {
    return { tipo: 'curp', valor: posibleCurp };
  }

  const soloDigitos = limpio.replace(/\D/g, '');
  if (
    canal === 'whatsapp' ||
    canal === 'call_center' ||
    (soloDigitos.length >= 10 && /^[\d\s()+-]+$/.test(limpio))
  ) {
    return { tipo: 'telefono', valor: normalizarTelefonoE164(limpio) };
  }

  // Identificadores de sesión/usuario de app o web
  return { tipo: 'externo', valor: limpio.toLowerCase() };
}
