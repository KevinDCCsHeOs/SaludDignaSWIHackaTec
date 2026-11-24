import type { CanalAtencion, EstadoResolucionIdentidad } from '@salud-digna/shared';
import mensajesEs from '../i18n/es.json';

const PATRONES_RECUPERACION = [
  /no puedo entrar a mi cuenta/i,
  /no tengo acceso a mi cuenta/i,
  /olvide mi contrasena/i,
  /olvidé mi contraseña/i,
  /recuperar (mi )?(cuenta|acceso|contraseña|contrasena)/i,
];

export interface ClienteApiRecuperacion {
  resolverIdentidad(
    canal: CanalAtencion,
    telefono: string,
  ): Promise<{ estado: EstadoResolucionIdentidad; pacienteId?: string }>;
  solicitarOtp(pacienteId: string, canal: CanalAtencion): Promise<{ enviado: boolean }>;
  verificarOtp(
    pacienteId: string,
    canal: CanalAtencion,
    codigo: string,
  ): Promise<{ verificado: boolean }>;
  solicitarEnlaceRecuperacion(
    telefono: string,
    canal: CanalAtencion,
  ): Promise<{ enviado: boolean }>;
}

export function esIntencionRecuperacionAcceso(texto: string): boolean {
  return PATRONES_RECUPERACION.some((rx) => rx.test(texto.trim()));
}

/**
 * Flujo conversacional del bot de WhatsApp para la opción "No puedo entrar a mi cuenta" (#9).
 * Regla de seguridad: nunca envía enlace ni revela datos antes de verificar OTP (#8).
 */
export async function manejarRecuperacionAccesoWhatsapp(
  entrada: { telefono: string; mensaje: string; codigoOtp?: string; pacienteId?: string },
  api: ClienteApiRecuperacion,
): Promise<{
  paso: 'esperando_otp' | 'enlace_enviado' | 'escalar_asesor' | 'no_encontrado' | 'otp_invalido';
  pacienteId?: string;
  respuesta: string;
}> {
  // Paso 2: el paciente ya proporcionó el código OTP
  if (entrada.codigoOtp && entrada.pacienteId) {
    try {
      const verif = await api.verificarOtp(entrada.pacienteId, 'whatsapp', entrada.codigoOtp);
      if (!verif.verificado) {
        return { paso: 'otp_invalido', respuesta: mensajesEs.recuperacion.errorOtp };
      }
      await api.solicitarEnlaceRecuperacion(entrada.telefono, 'whatsapp');
      return {
        paso: 'enlace_enviado',
        pacienteId: entrada.pacienteId,
        respuesta: mensajesEs.recuperacion.enlaceEnviado,
      };
    } catch {
      return { paso: 'otp_invalido', respuesta: mensajesEs.recuperacion.errorOtp };
    }
  }

  // Paso 1: identificar al paciente y solicitar OTP antes de emitir el enlace
  const resolucion = await api.resolverIdentidad('whatsapp', entrada.telefono);
  if (resolucion.estado === 'ambiguo') {
    return { paso: 'escalar_asesor', respuesta: mensajesEs.recuperacion.casoAmbiguo };
  }
  if (resolucion.estado === 'nuevo' || !resolucion.pacienteId) {
    return { paso: 'no_encontrado', respuesta: mensajesEs.recuperacion.noEncontrado };
  }

  await api.solicitarOtp(resolucion.pacienteId, 'whatsapp');
  return {
    paso: 'esperando_otp',
    pacienteId: resolucion.pacienteId,
    respuesta: mensajesEs.recuperacion.pedirOtp,
  };
}
