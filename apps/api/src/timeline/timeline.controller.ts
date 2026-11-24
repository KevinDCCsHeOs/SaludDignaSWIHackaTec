import { Controller, ForbiddenException, Get, Param, Query, Req } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import type { Request } from 'express';
import { Auditar } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { TimelineService } from './timeline.service';

@Controller('pacientes/:id/timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Auditar({ accion: 'leer', entidad: 'Timeline' })
  @Get()
  obtenerTimeline(
    @Param('id') pacienteId: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('canal') canal: CanalAtencion | undefined,
    @Query('tramiteId') tramiteId: string | undefined,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    if (req.usuario.rol === 'paciente' && req.usuario.pacienteId !== pacienteId) {
      throw new ForbiddenException('Un paciente solo puede consultar su propia línea de tiempo');
    }
    return this.timeline.consultar(pacienteId, {
      limit: limit ? Number(limit) : undefined,
      cursor,
      canal,
      tramiteId,
    });
  }
}
