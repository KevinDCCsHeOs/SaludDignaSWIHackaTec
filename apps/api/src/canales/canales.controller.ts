import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { Auditar, Publico, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import {
  CanalesService,
  CorreoEntranteSchema,
  EstadoEntregaMensaje,
  RegistrarInteraccionSchema,
  RegistrarLlamadaSchema,
  RegistrarPushTokenSchema,
} from './canales.service';

type RequestAutenticado = Request & { usuario: UsuarioAutenticado };

@Controller('canales')
export class CanalesController {
  constructor(
    private readonly canales: CanalesService,
    private readonly acceso: AccesoPacienteService,
  ) {}

  @Roles('asesor', 'asesor_pro', 'admin')
  @Auditar({ accion: 'crear', entidad: 'InteraccionLlamada' })
  @Post('llamadas')
  registrarLlamada(
    @Body() body: z.input<typeof RegistrarLlamadaSchema>,
    @Req() req: RequestAutenticado,
  ) {
    return this.canales.registrarLlamada(body, { id: req.usuario.id, tipo: req.usuario.rol });
  }

  @Publico()
  @Auditar({ accion: 'crear', entidad: 'InteraccionEmail' })
  @Post('email/entrante')
  procesarCorreoEntrante(@Body() body: z.input<typeof CorreoEntranteSchema>) {
    return this.canales.procesarCorreoEntrante(body);
  }

  @Roles('asesor_ia', 'asesor', 'asesor_pro', 'admin')
  @Auditar({ accion: 'crear', entidad: 'InteraccionCanal' })
  @Post('interacciones')
  registrarInteraccion(@Body() body: z.input<typeof RegistrarInteraccionSchema>) {
    return this.canales.registrarInteraccionCanal(body);
  }

  @Roles('asesor_ia', 'admin')
  @Post('interacciones/estado-entrega')
  actualizarEstadoEntrega(
    @Body() body: { canal: CanalAtencion; referenciaExterna: string; estado: EstadoEntregaMensaje },
  ) {
    return this.canales.actualizarEstadoEntrega(
      body.canal ?? 'whatsapp',
      body.referenciaExterna,
      body.estado,
    );
  }

  @Auditar({ accion: 'leer', entidad: 'InteraccionCanal' })
  @Get('interacciones/:pacienteId')
  async listarInteracciones(
    @Param('pacienteId') pacienteId: string,
    @Req() req: RequestAutenticado,
  ) {
    await this.acceso.verificar(req.usuario, pacienteId, req.headers['x-canal']);
    const interacciones = this.canales.listarInteracciones(pacienteId);
    return { pacienteId, total: interacciones.length, interacciones };
  }

  @Auditar({ accion: 'crear', entidad: 'PushToken' })
  @Post('push-tokens')
  async registrarPushToken(
    @Body() body: z.input<typeof RegistrarPushTokenSchema>,
    @Req() req: RequestAutenticado,
  ) {
    if (typeof body?.pacienteId === 'string') {
      await this.acceso.verificar(req.usuario, body.pacienteId, req.headers['x-canal']);
    }
    return this.canales.registrarPushToken(body);
  }

  @Get('push-tokens/:pacienteId')
  async listarPushTokens(@Param('pacienteId') pacienteId: string, @Req() req: RequestAutenticado) {
    await this.acceso.verificar(req.usuario, pacienteId, req.headers['x-canal']);
    return {
      pacienteId,
      tokens: this.canales.listarPushTokens(pacienteId),
      notificacionesEnviadas: this.canales.obtenerPushDespachados(pacienteId),
    };
  }
}
