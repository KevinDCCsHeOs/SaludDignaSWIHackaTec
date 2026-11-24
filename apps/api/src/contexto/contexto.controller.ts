import { Body, Controller, ForbiddenException, Get, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Auditar } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { TramitesService } from '../tramites/tramites.service';
import { ContextoService, PatchContextoSchema } from './contexto.service';

@Controller()
export class ContextoController {
  constructor(
    private readonly contexto: ContextoService,
    private readonly tramites: TramitesService,
  ) {}

  @Auditar({ accion: 'actualizar', entidad: 'Contexto' })
  @Patch('tramites/:id/contexto')
  actualizarParcial(
    @Param('id') id: string,
    @Body() body: z.input<typeof PatchContextoSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    const tramite = this.tramites.obtenerPorIdOFolio(id);
    if (req.usuario.rol === 'paciente' && req.usuario.pacienteId !== tramite.pacienteId) {
      throw new ForbiddenException('No puedes modificar el contexto de otro paciente');
    }
    return this.contexto.actualizarParcial(id, body, {
      tipo: req.usuario.rol,
      id: req.usuario.id,
    });
  }

  @Auditar({ accion: 'leer', entidad: 'Contexto' })
  @Get('pacientes/:id/contexto')
  obtenerPorPaciente(
    @Param('id') pacienteId: string,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    if (req.usuario.rol === 'paciente' && req.usuario.pacienteId !== pacienteId) {
      throw new ForbiddenException('No puedes consultar el contexto de otro paciente');
    }
    return this.contexto.obtenerPorPaciente(pacienteId);
  }
}
