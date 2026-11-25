import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { EstatusResultado } from '@salud-digna/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Auditar, Permisos, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import {
  CrearResultadoSchema,
  DecisionResultadoSchema,
  MensajeMedicoSchema,
  ResultadosService,
} from './resultados.service';

@Controller('resultados')
export class ResultadosController {
  constructor(private readonly resultados: ResultadosService) {}

  @Roles('paciente', 'revisor_tecnico', 'medico', 'admin')
  @Get()
  listar(
    @Query('estado') estado: EstatusResultado | undefined,
    @Query('pacienteId') pacienteId: string | undefined,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    const items = this.resultados.listarPorUsuario(req.usuario!, { estado, pacienteId });
    return { total: items.length, resultados: items };
  }

  @Roles('revisor_tecnico', 'medico', 'admin')
  @Post()
  crear(
    @Body() body: z.input<typeof CrearResultadoSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.resultados.crear(body, req.usuario!);
  }

  @Roles('paciente', 'revisor_tecnico', 'medico', 'admin')
  @Get(':id')
  obtener(@Param('id') id: string, @Req() req: Request & { usuario?: UsuarioAutenticado }) {
    return this.resultados.obtenerParaUsuario(id, req.usuario!);
  }

  @Roles('revisor_tecnico')
  @Permisos('resultado:revisar')
  @Auditar({ accion: 'actualizar', entidad: 'Resultado' })
  @Post(':id/revisar')
  revisar(
    @Param('id') id: string,
    @Body() body: z.input<typeof DecisionResultadoSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.resultados.revisarTecnica(id, body, req.usuario!, req.ip ?? '127.0.0.1');
  }

  @Roles('medico')
  @Permisos('resultado:liberar')
  @Auditar({ accion: 'actualizar', entidad: 'Resultado' })
  @Post(':id/validar')
  validar(
    @Param('id') id: string,
    @Body() body: z.input<typeof DecisionResultadoSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.resultados.validarMedica(id, body, req.usuario!, req.ip ?? '127.0.0.1');
  }

  @Roles('medico')
  @Permisos('resultado:liberar')
  @Auditar({ accion: 'liberar_resultado', entidad: 'Resultado' })
  @Post(':id/liberar')
  liberar(@Param('id') id: string, @Req() req: Request & { usuario?: UsuarioAutenticado }) {
    return this.resultados.liberar(id, req.usuario!, req.ip ?? '127.0.0.1');
  }

  @Roles('paciente', 'medico', 'admin')
  @Get(':id/pdf')
  descargarPdf(
    @Param('id') id: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
    @Res() res: Response,
  ) {
    const pdf = this.resultados.generarPdfParaUsuario(id, req.usuario!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="resultado-${id}.pdf"`);
    res.send(pdf);
  }

  @Roles('paciente', 'medico', 'admin')
  @Get(':id/mensajes')
  listarMensajes(@Param('id') id: string, @Req() req: Request & { usuario?: UsuarioAutenticado }) {
    const mensajes = this.resultados.listarMensajes(id, req.usuario!);
    return {
      resultadoId: id,
      tiempoEsperadoRespuestaMinutos: 30,
      mensajes,
    };
  }

  @Roles('paciente', 'medico', 'admin')
  @Post(':id/mensajes')
  enviarMensaje(
    @Param('id') id: string,
    @Body() body: z.input<typeof MensajeMedicoSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.resultados.enviarMensaje(id, body, req.usuario!);
  }
}
