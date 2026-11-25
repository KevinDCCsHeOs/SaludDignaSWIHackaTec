import { Logger } from '@nestjs/common';

const logger = new Logger('OtpWhatsapp');

/** Texto del código para el paciente (es obligatorio, en deseable). */
const TEXTO_CODIGO: Record<'es' | 'en', (codigo: string) => string> = {
  es: (codigo) =>
    `Tu código de verificación de Salud Digna es ${codigo}. Vence en 5 minutos. No lo compartas con nadie.`,
  en: (codigo) =>
    `Your Salud Digna verification code is ${codigo}. It expires in 5 minutes. Do not share it.`,
};

/** El despacho real solo ocurre en producción o desarrollo con credenciales de Meta, nunca en pruebas. */
export function despachoOtpWhatsappHabilitado(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.NODE_ENV !== 'test' &&
    env.WA_ACCESS_TOKEN &&
    env.WA_PHONE_NUMBER_ID &&
    !env.WA_ACCESS_TOKEN.startsWith('REEMPLAZAR'),
  );
}

/**
 * Envía el OTP por WhatsApp Cloud API como mensaje de texto (#8, #20).
 * Funciona dentro de la ventana de 24 h que abre el paciente al escribir, que es el flujo del bot.
 * Fuera de esa ventana Meta exige la plantilla de autenticación `sd_codigo_verificacion` (pendiente de aprobación).
 * Nunca registra el código, el teléfono ni el token: solo códigos de error.
 */
export async function despacharOtpWhatsapp(
  telefonoE164: string,
  codigo: string,
  idioma: string,
): Promise<boolean> {
  if (!despachoOtpWhatsappHabilitado()) return false;

  const texto = (idioma === 'en' ? TEXTO_CODIGO.en : TEXTO_CODIGO.es)(codigo);
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoE164.replace(/\D/g, ''),
          type: 'text',
          text: { body: texto },
        }),
      },
    );
    if (!resp.ok) {
      const json = (await resp.json().catch(() => ({}))) as { error?: { code?: number } };
      logger.error(`Meta rechazó el OTP: HTTP ${resp.status}, código ${json.error?.code ?? 'n/d'}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.error(`No se pudo contactar a Meta para el OTP: ${(error as Error).name}`);
    return false;
  }
}
