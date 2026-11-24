import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { EstatusTicket, PrioridadTicket } from '@salud-digna/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auditar, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import {
  CrearTicketSchema,
  EscalarTicketSchema,
  ResolverTicketSchema,
  TicketsService,
} from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Auditar({ accion: 'crear', entidad: 'Ticket' })
  @Post()
  crear(
    @Body() body: z.input<typeof CrearTicketSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    if (req.usuario.rol === 'paciente' && req.usuario.pacienteId !== body.pacienteId) {
      throw new ForbiddenException('Un paciente solo puede abrir tickets propios');
    }
    return this.tickets.crear(body, { tipo: req.usuario.rol, id: req.usuario.id });
  }

  @Auditar({ accion: 'leer', entidad: 'Ticket' })
  @Get()
  listar(
    @Query('region') region: string | undefined,
    @Query('estatus') estatus: EstatusTicket | undefined,
    @Query('prioridad') prioridad: PrioridadTicket | undefined,
    @Query('pacienteId') pacienteId: string | undefined,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    // Un paciente puede consultar sus propios tickets desde cualquier canal (#16)
    const filtroPaciente =
      req.usuario.rol === 'paciente' ? (req.usuario.pacienteId ?? '__none__') : pacienteId;
    const tickets = this.tickets.listar({
      region,
      estatus,
      prioridad,
      pacienteId: filtroPaciente,
    });
    return { total: tickets.length, tickets };
  }

  @Roles('asesor', 'asesor_pro', 'admin')
  @Auditar({ accion: 'actualizar', entidad: 'Ticket' })
  @Post(':id/asignar')
  asignar(@Param('id') id: string, @Body() body: { asesorId?: string }) {
    return this.tickets.asignar(id, body?.asesorId);
  }

  @Roles('asesor_ia', 'asesor', 'asesor_pro', 'admin')
  @Auditar({ accion: 'actualizar', entidad: 'Ticket' })
  @Post(':id/escalar')
  escalar(
    @Param('id') id: string,
    @Body() body: z.input<typeof EscalarTicketSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    return this.tickets.escalar(id, body, { tipo: req.usuario.rol, id: req.usuario.id });
  }

  @Roles('asesor', 'asesor_pro', 'admin')
  @Auditar({ accion: 'actualizar', entidad: 'Ticket' })
  @Post(':id/resolver')
  resolver(
    @Param('id') id: string,
    @Body() body: z.input<typeof ResolverTicketSchema>,
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    return this.tickets.resolver(id, body, { tipo: req.usuario.rol, id: req.usuario.id });
  }
}
