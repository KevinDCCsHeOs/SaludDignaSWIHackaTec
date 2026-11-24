import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AccionAuditoria, CanalAtencion } from '@salud-digna/shared';
import { Auditar, Permisos, Roles } from '../auth/decoradores';
import { AuditoriaService } from './auditoria.service';

@Controller('admin/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Roles('admin')
  @Permisos('auditoria:leer')
  @Auditar({ accion: 'leer', entidad: 'Auditoria' })
  @Get()
  consultar(
    @Query('pacienteId') pacienteId?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('canal') canal?: CanalAtencion,
    @Query('accion') accion?: AccionAuditoria,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
  ) {
    const registros = this.auditoria.consultar({
      pacienteId,
      usuarioId,
      canal,
      accion,
      desde,
      hasta,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      total: registros.length,
      registros,
    };
  }

  @Roles('admin')
  @Permisos('auditoria:leer')
  @Auditar({ accion: 'exportar', entidad: 'Auditoria' })
  @Get('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="auditoria-salud-digna.csv"')
  exportarCsv(
    @Query('pacienteId') pacienteId?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('canal') canal?: CanalAtencion,
    @Query('accion') accion?: AccionAuditoria,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
  ): string {
    return this.auditoria.exportarCsv({
      pacienteId,
      usuarioId,
      canal,
      accion,
      desde,
      hasta,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
