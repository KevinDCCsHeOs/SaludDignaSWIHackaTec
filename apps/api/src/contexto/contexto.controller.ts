import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Auditar } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import { TramitesService } from '../tramites/tramites.service';
import { ContextoService, PatchContextoSchema } from './contexto.service';

type RequestAutenticado = Request & { usuario: UsuarioAutenticado };

@Controller()
export class ContextoController {
  constructor(
    private readonly contexto: ContextoService,
    private readonly tramites: TramitesService,
    private readonly acceso: AccesoPacienteService,
  ) {}

  @Auditar({ accion: 'actualizar', entidad: 'Contexto' })
  @Patch('tramites/:id/contexto')
  async actualizarParcial(
    @Param('id') id: string,
    @Body() body: z.input<typeof PatchContextoSchema>,
    @Req() req: RequestAutenticado,
  ) {
    const tramite = this.tramites.obtenerPorIdOFolio(id);
    await this.acceso.verificar(req.usuario, tramite.pacienteId, req.headers['x-canal']);
    return this.contexto.actualizarParcial(id, body, {
      tipo: req.usuario.rol,
      id: req.usuario.id,
    });
  }

  @Auditar({ accion: 'leer', entidad: 'Contexto' })
  @Get('pacientes/:id/contexto')
  async obtenerPorPaciente(@Param('id') pacienteId: string, @Req() req: RequestAutenticado) {
    await this.acceso.verificar(req.usuario, pacienteId, req.headers['x-canal']);
    return this.contexto.obtenerPorPaciente(pacienteId);
  }
}
