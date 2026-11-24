import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifica la firma `X-Hub-Signature-256` enviada por Meta WhatsApp Cloud API (#20).
 */
export function verificarFirmaMeta(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) {
    // En desarrollo sin secreto configurado solo permite pasar fuera de producción
    return process.env.NODE_ENV !== 'production';
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const firmaRecibida = signatureHeader.slice('sha256='.length).trim();
  const firmaEsperada = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const bufA = Buffer.from(firmaRecibida, 'hex');
  const bufB = Buffer.from(firmaEsperada, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifica el handshake GET del webhook de Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`).
 */
export function verificarHandshakeWebhook(
  query: URLSearchParams,
  verifyTokenEsperado: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = query.get('hub.mode');
  const token = query.get('hub.verify_token');
  const challenge = query.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyTokenEsperado && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}
