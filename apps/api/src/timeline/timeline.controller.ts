import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import type { Request } from 'express';
import { Auditar } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import { TimelineService } from './timeline.service';

@Controller('pacientes/:id/timeline')
export class TimelineController {
  constructor(
    private readonly timeline: TimelineService,
    private readonly acceso: AccesoPacienteService,
  ) {}

  @Auditar({ accion: 'leer', entidad: 'Timeline' })
  @Get()
  async obtenerTimeline(
    @Param('id') pacienteId: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('canal') canal: string | undefined,
    @Query('tramiteId') tramiteId: string | undefined,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    await this.acceso.verificar(req.usuario, pacienteId, req.headers['x-canal']);
    const canalValido =
      canal && (CANALES_ATENCION as readonly string[]).includes(canal)
        ? (canal as CanalAtencion)
        : undefined;
    return this.timeline.consultar(pacienteId, {
      limit: limit ? Number(limit) : undefined,
      cursor,
      canal: canalValido,
      tramiteId,
    });
  }
}
