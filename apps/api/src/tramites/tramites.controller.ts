import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Auditar } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import {
  AvanzarTramiteSchema,
  CancelarTramiteSchema,
  CrearTramiteSchema,
  PausarTramiteSchema,
  RetomarTramiteSchema,
  TramitesService,
} from './tramites.service';

function verificarAccesoPaciente(usuario: UsuarioAutenticado, pacienteId: string): void {
  if (usuario.rol === 'paciente' && usuario.pacienteId !== pacienteId) {
    throw new ForbiddenException('Un paciente solo puede acceder a sus propios trámites');
  }
}

@Controller()
export class TramitesController {
  constructor(private readonly tramites: TramitesService) {}

  @Auditar({ accion: 'crear', entidad: 'Tramite' })
  @Post('tramites')
  crear(
    @Body() body: z.input<typeof CrearTramiteSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    verificarAccesoPaciente(req.usuario, body.pacienteId);
    return this.tramites.crear(body, { tipo: req.usuario.rol, id: req.usuario.id });
  }

  @Auditar({ accion: 'leer', entidad: 'Tramite' })
  @Get('pacientes/:id/tramites')
  listarDePaciente(
    @Param('id') pacienteId: string,
    @Query('activo') activo: string | undefined,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    verificarAccesoPaciente(req.usuario, pacienteId);
    const soloActivos = activo === 'true' || activo === '1';
    const tramites = this.tramites.listarPorPaciente(pacienteId, soloActivos);
    return { pacienteId, total: tramites.length, tramites };
  }

  @Auditar({ accion: 'leer', entidad: 'Tramite' })
  @Get('tramites/:id')
  obtener(@Param('id') id: string, @Req() req: Request & { usuario: UsuarioAutenticado }) {
    const tramite = this.tramites.obtenerPorIdOFolio(id);
    verificarAccesoPaciente(req.usuario, tramite.pacienteId);
    return tramite;
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/avanzar')
  avanzar(
    @Param('id') id: string,
    @Body() body: z.input<typeof AvanzarTramiteSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    const existente = this.tramites.obtenerPorIdOFolio(id);
    verificarAccesoPaciente(req.usuario, existente.pacienteId);
    return this.tramites.avanzar(id, body, { tipo: req.usuario.rol, id: req.usuario.id });
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/pausar')
  pausar(
    @Param('id') id: string,
    @Body() body: z.input<typeof PausarTramiteSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    const existente = this.tramites.obtenerPorIdOFolio(id);
    verificarAccesoPaciente(req.usuario, existente.pacienteId);
    return this.tramites.pausar(id, body, { tipo: req.usuario.rol, id: req.usuario.id });
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/retomar')
  retomar(
    @Param('id') id: string,
    @Body() body: z.input<typeof RetomarTramiteSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    const existente = this.tramites.obtenerPorIdOFolio(id);
    verificarAccesoPaciente(req.usuario, existente.pacienteId);
    return this.tramites.retomar(id, body, { tipo: req.usuario.rol, id: req.usuario.id });
  }

  @Auditar({ accion: 'actualizar', entidad: 'Tramite' })
  @Post('tramites/:id/cancelar')
  cancelar(
    @Param('id') id: string,
    @Body() body: z.input<typeof CancelarTramiteSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    const existente = this.tramites.obtenerPorIdOFolio(id);
    verificarAccesoPaciente(req.usuario, existente.pacienteId);
    return this.tramites.cancelar(id, body);
  }
}
