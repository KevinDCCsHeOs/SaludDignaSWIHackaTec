import { ConsoleLogger, Injectable } from '@nestjs/common';

const CLAVES_SENSIBLES = new Set([
  'password',
  'contrasena',
  'nuevacontrasena',
  'passwordhash',
  'hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'codigo',
  'otp',
  'curp',
  'curpcifrado',
  'curphash',
  'fechanacimiento',
  'fechanaccifrada',
  'email',
  'correo',
  'telefono',
  'telefonoe164',
  'mensaje',
  'body',
  'contenido',
  'contenidocifrado',
  'datosfiscales',
  'datosfiscalescifrados',
  'rfc',
  'authorization',
  'cookie',
]);

const REGEX_CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d\b/gi;
const REGEX_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const REGEX_TELEFONO = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/g;

/**
 * Elimina teléfonos, correos electrónicos y CURPs de cualquier cadena antes de escribir en logs (#10).
 */
export function sanitizarTextoParaLog(texto: string): string {
  return texto
    .replace(REGEX_CURP, '[CURP_REDACTADA]')
    .replace(REGEX_EMAIL, '[EMAIL_REDACTADO]')
    .replace(REGEX_TELEFONO, '[TEL_REDACTADO]');
}

/**
 * Recorre objetos/arreglos de forma segura y redacta claves sensibles y patrones PII.
 */
export function sanitizarObjetoParaLog(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) return '[PROFUNDIDAD_MAX]';
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return sanitizarTextoParaLog(valor);
  if (typeof valor !== 'object') return valor;

  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarObjetoParaLog(item, profundidad + 1));
  }

  const resultado: Record<string, unknown> = {};
  for (const [clave, val] of Object.entries(valor as Record<string, unknown>)) {
    if (CLAVES_SENSIBLES.has(clave.toLowerCase())) {
      resultado[clave] = '[REDACTADO]';
    } else {
      resultado[clave] = sanitizarObjetoParaLog(val, profundidad + 1);
    }
  }
  return resultado;
}

/**
 * Logger NestJS que garantiza que ningún dato sensible aparezca en consola o archivos de log (#10).
 */
@Injectable()
export class SanitizedLogger extends ConsoleLogger {
  private sanitizarMensaje(mensaje: unknown): unknown {
    if (typeof mensaje === 'string') return sanitizarTextoParaLog(mensaje);
    if (typeof mensaje === 'object' && mensaje !== null) {
      return sanitizarObjetoParaLog(mensaje);
    }
    return mensaje;
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(
      this.sanitizarMensaje(message),
      ...optionalParams.map((p) => this.sanitizarMensaje(p)),
    );
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(
      this.sanitizarMensaje(message),
      ...optionalParams.map((p) => this.sanitizarMensaje(p)),
    );
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(
      this.sanitizarMensaje(message),
      ...optionalParams.map((p) => this.sanitizarMensaje(p)),
    );
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(
      this.sanitizarMensaje(message),
      ...optionalParams.map((p) => this.sanitizarMensaje(p)),
    );
  }
}
