import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import type { UsuarioAutenticado } from '../auth/guards';
import { OtpService } from './otp.service';

/**
 * Regla "verificar antes de revelar" (AGENTS.md, #8, #13) aplicada a los datos de un paciente:
 *
 * - `paciente`: solo accede a lo suyo (su sesión ya está autenticada con contraseña).
 * - `asesor_ia` (bot de WhatsApp con token de servicio): necesita una sesión OTP vigente del
 *   paciente en el canal indicado por el header `x-canal` (por defecto `whatsapp`).
 * - Personal autenticado (asesores, médicos, admin): acceso por rol. La verificación por
 *   preguntas en Call Center se aplica en la consola del asesor (#19).
 */
@Injectable()
export class AccesoPacienteService {
  constructor(private readonly otp: OtpService) {}

  async verificar(
    usuario: UsuarioAutenticado,
    pacienteId: string,
    canalHeader?: string | string[],
  ): Promise<void> {
    if (usuario.rol === 'paciente') {
      if (usuario.pacienteId !== pacienteId) {
        throw new ForbiddenException('Un paciente solo puede acceder a sus propios datos');
      }
      return;
    }

    if (usuario.rol === 'asesor_ia') {
      const canal = this.resolverCanal(canalHeader);
      const verificado = await this.otp.tieneSesionVerificada(pacienteId, canal);
      if (!verificado) {
        throw new ForbiddenException(
          'Debes verificar la identidad del paciente (OTP) antes de consultar o modificar su trámite.',
        );
      }
    }
  }

  private resolverCanal(canalHeader?: string | string[]): CanalAtencion {
    const valor = Array.isArray(canalHeader) ? canalHeader[0] : canalHeader;
    return typeof valor === 'string' && (CANALES_ATENCION as readonly string[]).includes(valor)
      ? (valor as CanalAtencion)
      : 'whatsapp';
  }
}
