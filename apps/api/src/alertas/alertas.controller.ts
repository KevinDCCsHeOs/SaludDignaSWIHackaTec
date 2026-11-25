import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import { Auditar, Publico, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import { AlertasService, CrearAlertaSchema } from './alertas.service';

@Controller('alertas')
export class AlertasController {
  constructor(
    private readonly alertas: AlertasService,
    private readonly accesoPaciente: AccesoPacienteService,
  ) {}

  @Publico()
  @Get('activas')
  listarActivas(@Query('region') region?: string) {
    const items = this.alertas.listarActivas(region);
    return { total: items.length, alertas: items };
  }

  @Roles('admin')
  @Auditar({ accion: 'crear', entidad: 'AlertaEpidemiologica' })
  @Post()
  publicar(
    @Body() body: z.input<typeof CrearAlertaSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.alertas.publicarAlerta(body, req.usuario!, req.ip ?? '127.0.0.1');
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Get('entregas/:pacienteId')
  async listarEntregas(
    @Param('pacienteId') pacienteId: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    await this.accesoPaciente.verificar(req.usuario!, pacienteId, req.headers['x-canal']);
    const entregas = this.alertas.listarEntregasPaciente(pacienteId);
    return { total: entregas.length, entregas };
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'medico', 'admin')
  @Get('prevencion/:pacienteId')
  async evaluarPrevencion(
    @Param('pacienteId') pacienteId: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    await this.accesoPaciente.verificar(req.usuario!, pacienteId, req.headers['x-canal']);
    const recordatorios = this.alertas.evaluarPrevencionPaciente(pacienteId);
    return { total: recordatorios.length, recordatorios };
  }

  @Roles('admin')
  @Post('prevencion/evaluar')
  despacharPrevencion() {
    return this.alertas.despacharRecordatoriosPreventivos();
  }
}
