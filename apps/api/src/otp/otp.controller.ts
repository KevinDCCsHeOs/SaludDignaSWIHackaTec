import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import type { Request } from 'express';
import { Auditar, Permisos, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { OtpService } from './otp.service';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Permisos('otp:gestionar')
  @Post('solicitar')
  solicitar(
    @Body() body: { pacienteId: string; canal: CanalAtencion },
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    // El bot pide el OTP cuando el paciente acaba de escribir (ventana de 24 h abierta);
    // cualquier otro canal necesita la plantilla de autenticación de Meta.
    const origen = req.usuario?.rol === 'asesor_ia' ? 'conversacion' : 'externo';
    return this.otpService.solicitarOtp(body, req.ip ?? '127.0.0.1', origen);
  }

  @Permisos('otp:gestionar')
  @Post('verificar')
  verificar(
    @Body() body: { pacienteId: string; canal?: CanalAtencion; codigo: string },
    @Req() req: Request,
  ) {
    return this.otpService.verificarOtp(body, req.ip ?? '127.0.0.1');
  }

  @Roles('asesor', 'asesor_pro', 'admin')
  @Permisos('otp:call_center')
  @Auditar({ accion: 'verificar_otp', entidad: 'CallCenterVerificacion' })
  @Post('verificar-call-center')
  verificarCallCenter(
    @Body()
    body: { pacienteId: string; fechaNacimiento: string; ultimosDigitosTelefono: string },
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.otpService.verificarPreguntasCallCenter(
      body,
      req.usuario?.id ?? 'asesor',
      req.ip ?? '127.0.0.1',
    );
  }

  @Permisos('otp:gestionar')
  @Get('estado/:pacienteId')
  async estado(
    @Param('pacienteId') pacienteId: string,
    @Query('canal') canal: CanalAtencion = 'whatsapp',
  ) {
    return {
      pacienteId,
      canal,
      verificado: await this.otpService.tieneSesionVerificada(pacienteId, canal),
    };
  }
}
