import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { IdiomaPaciente } from '@salud-digna/shared';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import type { z } from 'zod';
import { Auditar, Publico, Roles } from '../auth/decoradores';
import {
  obtenerSecretoJwtAcceso,
  obtenerTokenServicioBot,
  type PayloadJwtAcceso,
  type UsuarioAutenticado,
} from '../auth/guards';
import { CatalogosService } from '../catalogos/catalogos.service';
import {
  explicarPreparacionSencilla,
  GLOSARIO_MEDICO_SENCILLO,
  listarEstudiosConPreparacionSencilla,
} from './glosario';
import { ConsultaIaSchema, IaService } from './ia.service';
import { VigenciasService } from './vigencias.service';

@Controller('ia')
export class IaController {
  constructor(
    private readonly ia: IaService,
    private readonly vigencias: VigenciasService,
    private readonly catalogos: CatalogosService,
  ) {}

  /**
   * Extrae el usuario autenticado si viene JWT o `x-service-token`, sin bloquear visitantes anónimos
   * en el chat web (que solo reciben respuestas públicas sin contexto privado, #24).
   */
  private extraerUsuarioOpcional(req: Request): UsuarioAutenticado | undefined {
    const tokenServicio = req.headers['x-service-token'];
    if (typeof tokenServicio === 'string' && tokenServicio === obtenerTokenServicioBot()) {
      return {
        id: 'usr_asesor_ia',
        email: 'ia.bot@demo.saluddigna.local',
        rol: 'asesor_ia',
        region: null,
        pacienteId: null,
      };
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return undefined;
    try {
      const payload = jwt.verify(
        auth.slice('Bearer '.length).trim(),
        obtenerSecretoJwtAcceso(),
      ) as PayloadJwtAcceso;
      if (payload.tipo !== 'access') return undefined;
      return {
        id: payload.sub,
        email: payload.email,
        rol: payload.rol,
        region: payload.region,
        pacienteId: payload.pacienteId,
      };
    } catch {
      return undefined;
    }
  }

  @Publico()
  @Auditar({ accion: 'crear', entidad: 'AsistenteIA' })
  @Post('mensaje')
  consultarAsistente(@Body() body: z.input<typeof ConsultaIaSchema>, @Req() req: Request) {
    const usuario = this.extraerUsuarioOpcional(req);
    return this.ia.procesarMensaje(body, usuario);
  }

  @Publico()
  @Get('glosario')
  obtenerGlosario(@Query('q') q?: string, @Query('idioma') idioma?: IdiomaPaciente) {
    const lang: IdiomaPaciente = idioma === 'en' || idioma === 'nah' ? idioma : 'es';
    const termino = (q ?? '').trim().toLowerCase();
    const terminos = termino
      ? GLOSARIO_MEDICO_SENCILLO.filter(
          (g) =>
            g.termino.toLowerCase().includes(termino) ||
            g.aliases.some((a) => a.toLowerCase().includes(termino)),
        )
      : GLOSARIO_MEDICO_SENCILLO;

    return {
      idioma: lang,
      totalTerminos: terminos.length,
      terminos,
      estudios: listarEstudiosConPreparacionSencilla(lang),
    };
  }

  @Publico()
  @Get('estudios/:estudioId/preparacion-sencilla')
  obtenerPreparacionSencilla(
    @Param('estudioId') estudioId: string,
    @Query('idioma') idioma?: IdiomaPaciente,
  ) {
    const lang: IdiomaPaciente = idioma === 'en' || idioma === 'nah' ? idioma : 'es';
    const estudio = this.catalogos.obtenerEstudioPorId(estudioId);
    return {
      estudioId: estudio.id,
      nombre: estudio.nombre,
      idioma: lang,
      preparacionClinica: estudio.preparacion,
      preparacionSencilla: explicarPreparacionSencilla(estudio, lang),
    };
  }

  @Roles('admin', 'asesor', 'asesor_pro', 'asesor_ia')
  @Get('vigencias/proximas')
  listarVigenciasProximas() {
    const items = this.vigencias.listarProximasAVencer();
    return { total: items.length, items };
  }

  @Roles('admin', 'asesor_pro', 'asesor_ia')
  @Post('vigencias/verificar')
  verificarVigencias(@Body() body?: { ahoraIso?: string }) {
    const ahoraMs =
      body?.ahoraIso && !Number.isNaN(Date.parse(body.ahoraIso))
        ? Date.parse(body.ahoraIso)
        : Date.now();
    return this.vigencias.verificarVigencias(ahoraMs);
  }
}
