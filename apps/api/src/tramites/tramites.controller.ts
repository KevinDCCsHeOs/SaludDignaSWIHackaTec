import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Auditar } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import {
  AvanzarTramiteSchema,
  CancelarTramiteSchema,
  CrearTramiteSchema,
  PausarTramiteSchema,
  RetomarTramiteSchema,
  TramitesService,
} from './tramites.service';

type RequestAutenticado = Request & { usuario: UsuarioAutenticado };

@Controller()
export class TramitesController {
  constructor(
    private readonly tramites: TramitesService,
    private readonly acceso: AccesoPacienteService,
  ) {}

  private actor(req: RequestAutenticado) {
    return { tipo: req.usuario.rol, id: req.usuario.id };
  }

  /** Busca el trámite y valida que quien llama pueda verlo o modificarlo. */
  private async tramiteAutorizado(id: string, req: RequestAutenticado) {
    const tramite = this.tramites.obtenerPorIdOFolio(id);
    await this.acceso.verificar(req.usuario, tramite.pacienteId, req.headers['x-canal']);
    return tramite;
  }

  @Auditar({ accion: 'crear', entidad: 'Tramite' })
  @Post('tramites')
  async crear(@Body() body: z.input<typeof CrearTramiteSchema>, @Req() req: RequestAutenticado) {
    // Si falta el pacienteId, el servicio responde 400 al validar el cuerpo
    if (typeof body?.pacienteId === 'string') {
      await this.acceso.verificar(req.usuario, body.pacienteId, req.headers['x-canal']);
    }
    return this.tramites.crear(body, this.actor(req));
  }

  @Auditar({ accion: 'leer', entidad: 'Tramite' })
  @Get('pacientes/:id/tramites')
  async listarDePaciente(
    @Param('id') pacienteId: string,
    @Query('activo') activo: string | undefined,
    @Req() req: RequestAutenticado,
  ) {
    await this.acceso.verificar(req.usuario, pacienteId, req.headers['x-canal']);
    const soloActivos = activo === 'true' || activo === '1';
    const tramites = this.tramites.listarPorPaciente(pacienteId, soloActivos);
    return { pacienteId, total: tramites.length, tramites };
  }

  @Auditar({ accion: 'leer', entidad: 'Tramite' })
  @Get('tramites/:id')
  obtener(@Param('id') id: string, @Req() req: RequestAutenticado) {
    return this.tramiteAutorizado(id, req);
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/avanzar')
  async avanzar(
    @Param('id') id: string,
    @Body() body: z.input<typeof AvanzarTramiteSchema>,
    @Req() req: RequestAutenticado,
  ) {
    await this.tramiteAutorizado(id, req);
    return this.tramites.avanzar(id, body, this.actor(req));
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/pausar')
  async pausar(
    @Param('id') id: string,
    @Body() body: z.input<typeof PausarTramiteSchema>,
    @Req() req: RequestAutenticado,
  ) {
    await this.tramiteAutorizado(id, req);
    return this.tramites.pausar(id, body, this.actor(req));
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/retomar')
  async retomar(
    @Param('id') id: string,
    @Body() body: z.input<typeof RetomarTramiteSchema>,
    @Req() req: RequestAutenticado,
  ) {
    await this.tramiteAutorizado(id, req);
    return this.tramites.retomar(id, body, this.actor(req));
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() body: z.input<typeof CancelarTramiteSchema>,
    @Req() req: RequestAutenticado,
  ) {
    await this.tramiteAutorizado(id, req);
    return this.tramites.cancelar(id, body, this.actor(req));
  }
}
