import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Auditar, Permisos, Publico } from '../auth/decoradores';
import { AVISO_PRIVACIDAD_DEMO } from './aviso-privacidad';
import { ConsentimientoService, RegistrarConsentimientoInput } from './consentimiento.service';

@Controller('privacidad')
export class PrivacidadController {
  constructor(private readonly consentimientoService: ConsentimientoService) {}

  @Publico()
  @Get('aviso')
  obtenerAviso() {
    return AVISO_PRIVACIDAD_DEMO;
  }

  @Permisos('privacidad:consentimiento:registrar')
  @Auditar({ accion: 'crear', entidad: 'Consentimiento' })
  @Post('consentimientos')
  registrarConsentimiento(@Body() body: RegistrarConsentimientoInput, @Req() req: Request) {
    return this.consentimientoService.registrar({
      ...body,
      ip: req.ip ?? body.ip,
    });
  }

  @Permisos('privacidad:consentimiento:leer')
  @Auditar({ accion: 'leer', entidad: 'Consentimiento' })
  @Get('consentimientos/:pacienteId')
  listarPorPaciente(@Param('pacienteId') pacienteId: string) {
    return {
      pacienteId,
      consentimientos: this.consentimientoService.listarPorPaciente(pacienteId),
    };
  }
}
