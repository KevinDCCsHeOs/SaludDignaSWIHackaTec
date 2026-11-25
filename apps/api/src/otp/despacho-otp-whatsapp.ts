import { Logger } from '@nestjs/common';

const logger = new Logger('OtpWhatsapp');

/** Texto del código para el paciente (es obligatorio, en deseable). */
const TEXTO_CODIGO: Record<'es' | 'en', (codigo: string) => string> = {
  es: (codigo) =>
    `Tu código de verificación de Salud Digna es ${codigo}. Vence en 15 minutos. No lo compartas con nadie.`,
  en: (codigo) =>
    `Your Salud Digna verification code is ${codigo}. It expires in 15 minutes. Do not share it.`,
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

/** Error de Meta cuando ya pasaron más de 24 h desde el último mensaje del paciente. */
const ERROR_FUERA_DE_VENTANA_24H = 131047;
/** Plantilla de autenticación aprobada en Meta (categoría AUTHENTICATION, botón "Copiar código"). */
const PLANTILLA_OTP = 'sd_codigo_verificacion';

type ResultadoMeta = { ok: true } | { ok: false; status: number; codigo?: number };

async function enviarAMeta(cuerpo: Record<string, unknown>): Promise<ResultadoMeta> {
  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
    },
  );
  if (resp.ok) return { ok: true };
  const json = (await resp.json().catch(() => ({}))) as { error?: { code?: number } };
  return { ok: false, status: resp.status, codigo: json.error?.code };
}

/**
 * Envía el OTP por WhatsApp Cloud API (#8, #20).
 * - `conversacion` (lo pide el bot porque el paciente acaba de escribir): va como texto, gratis y
 *   válido dentro de la ventana de 24 h. Si Meta lo rechaza por ventana cerrada (131047), usa la plantilla.
 * - `externo` (web, app o Call Center, sin conversación abierta): va directo con la plantilla de
 *   autenticación `sd_codigo_verificacion`, la única forma que Meta permite fuera de la ventana.
 * Nunca registra el código, el teléfono ni el token: solo códigos de error.
 */
export async function despacharOtpWhatsapp(
  telefonoE164: string,
  codigo: string,
  idioma: string,
  origen: 'conversacion' | 'externo' = 'conversacion',
): Promise<boolean> {
  if (!despachoOtpWhatsappHabilitado()) return false;

  const para = telefonoE164.replace(/\D/g, '');
  const texto = (idioma === 'en' ? TEXTO_CODIGO.en : TEXTO_CODIGO.es)(codigo);
  try {
    if (origen === 'conversacion') {
      const porTexto = await enviarAMeta({ to: para, type: 'text', text: { body: texto } });
      if (porTexto.ok) return true;

      if (porTexto.codigo !== ERROR_FUERA_DE_VENTANA_24H) {
        logger.error(
          `Meta rechazó el OTP: HTTP ${porTexto.status}, código ${porTexto.codigo ?? 'n/d'}`,
        );
        return false;
      }
    }

    const porPlantilla = await enviarAMeta({
      to: para,
      type: 'template',
      template: {
        name: PLANTILLA_OTP,
        language: { code: idioma === 'en' ? 'en_US' : 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: codigo }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: codigo }],
          },
        ],
      },
    });
    if (!porPlantilla.ok) {
      logger.error(
        `Meta rechazó la plantilla del OTP: HTTP ${porPlantilla.status}, código ${porPlantilla.codigo ?? 'n/d'}`,
      );
    }
    return porPlantilla.ok;
  } catch (error) {
    logger.error(`No se pudo contactar a Meta para el OTP: ${(error as Error).name}`);
    return false;
  }
}
