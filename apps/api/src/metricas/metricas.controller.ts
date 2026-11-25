import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import type { Request, Response } from 'express';
import { Auditar, Permisos, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { MetricasService } from './metricas.service';

@Controller()
export class MetricasController {
  constructor(private readonly metricas: MetricasService) {}

  @Roles('admin', 'asesor_pro')
  @Get('admin/metricas')
  obtenerMetricasAdmin(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('region') region?: string,
  ) {
    return this.metricas.calcularMetricasAdmin({ desde, hasta, region });
  }

  @Roles('admin')
  @Permisos('kpis:leer')
  @Auditar({ accion: 'exportar', entidad: 'MetricasKPIs' })
  @Get('admin/metricas/export.csv')
  exportarCsv(
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @Query('region') region: string | undefined,
    @Res() res: Response,
  ) {
    const csv = this.metricas.exportarMetricasCsv({ desde, hasta, region });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="metricas-salud-digna.csv"');
    res.send(csv);
  }

  @Roles('admin', 'asesor', 'asesor_pro')
  @Get('journey/pacientes')
  listarJourney(
    @Query('region') region?: string,
    @Query('estado') estado?: string,
    @Query('canal') canal?: CanalAtencion,
    @Query('q') q?: string,
  ) {
    const pacientes = this.metricas.listarPacientesJourney({ region, estado, canal, q });
    return { total: pacientes.length, pacientes };
  }

  @Roles('admin', 'asesor', 'asesor_pro')
  @Get('journey/pacientes/:pacienteId')
  obtenerJourneyPaciente(@Param('pacienteId') pacienteId: string) {
    return this.metricas.obtenerDetalleJourney(pacienteId);
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'medico', 'revisor_tecnico', 'admin')
  @Get('estadisticas/mi-rol')
  obtenerEstadisticasMiRol(@Req() req: Request & { usuario?: UsuarioAutenticado }) {
    return this.metricas.obtenerEstadisticasPorRol(req.usuario!);
  }
}
