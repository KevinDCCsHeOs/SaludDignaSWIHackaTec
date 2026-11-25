import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { EstatusClinica } from '@salud-digna/shared';
import type { Request } from 'express';
import { Auditar, Publico, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import { ServicioService } from './servicio.service';

@Controller()
export class ServicioController {
  constructor(
    private readonly servicio: ServicioService,
    private readonly accesoPaciente: AccesoPacienteService,
  ) {}

  @Publico()
  @Get('servicio/estatus')
  obtenerEstatus(@Query('region') region?: string) {
    return this.servicio.obtenerEstatusGeneral(region);
  }

  @Roles('admin', 'asesor_pro')
  @Auditar({ accion: 'actualizar', entidad: 'ClinicaEstatus' })
  @Patch('servicio/clinicas/:clinicaId/estatus')
  actualizarClinica(
    @Param('clinicaId') clinicaId: string,
    @Body() body: { estatus: EstatusClinica; mensajeEstatus?: string | null },
  ) {
    return this.servicio.actualizarEstatusClinica(
      clinicaId,
      body.estatus,
      body.mensajeEstatus ?? null,
    );
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'medico', 'revisor_tecnico', 'admin')
  @Get('tramites/:folio/proceso')
  async obtenerProcesoDiagnostico(
    @Param('folio') folio: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    const proceso = this.servicio.obtenerProcesoDiagnostico(folio);
    await this.accesoPaciente.verificar(req.usuario!, proceso.pacienteId, req.headers['x-canal']);
    return proceso;
  }
}
