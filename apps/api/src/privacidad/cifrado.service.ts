import { Inject, Injectable, Optional } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const PREFIJO_CIFRADO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';
const LONGITUD_IV = 12;
const TOKEN_LLAVE_CIFRADO = 'SD_ENCRYPTION_KEY_OPT';
const TOKEN_PEPPER_CURP = 'SD_CURP_PEPPER_OPT';

/**
 * Servicio de cifrado simétrico AES-256-GCM y hash determinista de CURP (#10, ADR 0002).
 * La llave proviene exclusivamente de `ENCRYPTION_KEY` (entorno, nunca fija en producción).
 */
@Injectable()
export class CifradoService {
  private readonly llave: Buffer;
  private readonly pepperCurp: string;

  constructor(
    @Optional() @Inject(TOKEN_LLAVE_CIFRADO) llaveHex?: string,
    @Optional() @Inject(TOKEN_PEPPER_CURP) pepper?: string,
  ) {
    const rawKey = llaveHex ?? process.env.ENCRYPTION_KEY;
    const rawPepper = pepper ?? process.env.CURP_HASH_PEPPER;

    if (!rawKey && process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY es obligatoria en producción (LFPDPPP)');
    }

    // Deriva exactamente 32 bytes (256 bits) determinísticamente si llega en formato libre/hex
    const semilla = rawKey ?? 'dev-ephemeral-encryption-key-not-for-prod';
    this.llave = /^[0-9a-fA-F]{64}$/.test(semilla)
      ? Buffer.from(semilla, 'hex')
      : createHash('sha256').update(semilla).digest();

    this.pepperCurp = rawPepper ?? 'dev-ephemeral-curp-pepper-not-for-prod';
  }

  esCifrado(valor: string | null | undefined): boolean {
    return typeof valor === 'string' && valor.startsWith(PREFIJO_CIFRADO);
  }

  cifrar(textoPlano: string): string {
    if (this.esCifrado(textoPlano)) {
      return textoPlano;
    }
    const iv = randomBytes(LONGITUD_IV);
    const cipher = createCipheriv(ALGORITMO, this.llave, iv);
    const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIJO_CIFRADO}${iv.toString('base64')}:${tag.toString('base64')}:${cifrado.toString('base64')}`;
  }

  descifrar(textoCifrado: string): string {
    if (!this.esCifrado(textoCifrado)) {
      return textoCifrado;
    }
    const sinPrefijo = textoCifrado.slice(PREFIJO_CIFRADO.length);
    const partes = sinPrefijo.split(':');
    if (partes.length !== 3) {
      throw new Error('Formato de dato cifrado inválido');
    }
    const [ivB64, tagB64, datosB64] = partes;
    const decipher = createDecipheriv(ALGORITMO, this.llave, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plano = Buffer.concat([
      decipher.update(Buffer.from(datosB64, 'base64')),
      decipher.final(),
    ]);
    return plano.toString('utf8');
  }

  /**
   * Hash determinista (64 chars hex) para búsquedas `WHERE curp_hash = ?` sin descifrar (ADR 0002).
   */
  hashCurp(curp: string): string {
    const normalizada = curp.trim().toUpperCase();
    return createHmac('sha256', this.pepperCurp).update(normalizada).digest('hex');
  }
}
