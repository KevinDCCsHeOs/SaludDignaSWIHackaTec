import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CanalAtencion, IdiomaPaciente } from '@salud-digna/shared';
import type { Request } from 'express';
import { Auditar, Permisos, RequiereCanalVerificado, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { CanalVerificadoGuard } from '../otp/otp.service';
import { TramitesService } from '../tramites/tramites.service';
import { IdentityResolverService, RegistroLigeroSchema } from './identidad.service';
import type { z } from 'zod';

@Controller('identidad')
export class IdentidadController {
  constructor(
    private readonly identidadService: IdentityResolverService,
    private readonly tramites: TramitesService,
  ) {}

  @Roles('asesor', 'asesor_pro', 'admin')
  @Permisos('tramite:otros:leer')
  @Auditar({ accion: 'leer', entidad: 'PacienteBusqueda' })
  @Get('pacientes/buscar')
  buscarPacientes(
    @Query('q') q: string | undefined,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    const rol = req.usuario?.rol ?? 'asesor';
    const termino = (q ?? '').trim();

    // Si busca por folio de trámite (SD-2026-...), resuelve directamente al paciente titular
    if (/^SD-\d{4}-\d+$/i.test(termino)) {
      try {
        const tramite = this.tramites.obtenerPorIdOFolio(termino.toUpperCase());
        const perfil = this.identidadService.obtenerPerfilMinimizado(tramite.pacienteId, rol);
        return { total: 1, pacientes: [{ ...perfil, folioCoincidente: tramite.folio }] };
      } catch {
        return { total: 0, pacientes: [] };
      }
    }

    const pacientes = this.identidadService.buscarPacientesMinimizado(termino, rol);
    return { total: pacientes.length, pacientes };
  }

  @Permisos('identidad:resolver')
  @Post('resolver')
  resolver(@Body() body: { canal: CanalAtencion; identificador: string }) {
    return this.identidadService.resolver(body);
  }

  @Permisos('identidad:vincular')
  @Auditar({ accion: 'vincular_identidad', entidad: 'IdentidadCanal' })
  @Post('vincular')
  vincular(
    @Body()
    body: {
      pacienteId: string;
      canal: CanalAtencion;
      identificador: string;
      metodoVerificacion?: string;
    },
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.identidadService.vincularTrasVerificacion(
      body,
      req.usuario?.id ?? 'sistema',
      req.ip ?? '127.0.0.1',
    );
  }

  @Permisos('identidad:resolver')
  @Post('registro-ligero')
  registrarLigero(@Body() body: z.input<typeof RegistroLigeroSchema>) {
    return this.identidadService.registrarLigero(body);
  }

  @Roles('asesor_pro', 'admin')
  @Permisos('identidad:merge')
  @Post('merge')
  fusionar(
    @Body() body: { pacienteOrigenId: string; pacienteDestinoId: string; motivo: string },
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.identidadService.fusionarDuplicados(
      body.pacienteOrigenId,
      body.pacienteDestinoId,
      body.motivo ?? 'Unificación manual revisada',
      req.usuario?.id ?? 'admin',
      req.usuario?.rol ?? 'admin',
      req.ip ?? '127.0.0.1',
    );
  }

  /**
   * Consulta de contexto/resumen del paciente protegida por OTP en canales externos (#8)
   * y enmascarada según el rol del solicitante (#10).
   */
  @Permisos('tramite:otros:leer')
  @Auditar({ accion: 'leer', entidad: 'Paciente' })
  @Get('pacientes/:pacienteId/resumen')
  obtenerResumenAsesor(
    @Param('pacienteId') pacienteId: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.identidadService.obtenerPerfilMinimizado(pacienteId, req.usuario?.rol ?? 'asesor');
  }

  /**
   * Endpoint para canales con verificación OTP obligatoria antes de revelar datos (#8).
   */
  @UseGuards(CanalVerificadoGuard)
  @RequiereCanalVerificado()
  @Permisos('identidad:resolver')
  @Auditar({ accion: 'leer', entidad: 'PacienteCanalVerificado' })
  @Get('pacientes/:pacienteId/contexto-seguro')
  obtenerContextoVerificado(
    @Param('pacienteId') pacienteId: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    return this.identidadService.obtenerPerfilMinimizado(
      pacienteId,
      req.usuario?.rol ?? 'asesor_ia',
    );
  }

  /**
   * Guarda la preferencia de idioma del paciente (`es`, `en`, `nah`, #26).
   */
  @Roles('paciente', 'asesor_ia', 'asesor', 'asesor_pro', 'admin')
  @Auditar({ accion: 'actualizar', entidad: 'PacienteIdioma' })
  @Patch('pacientes/:pacienteId/idioma')
  actualizarIdioma(
    @Param('pacienteId') pacienteId: string,
    @Body() body: { idioma: IdiomaPaciente },
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    if (req.usuario?.rol === 'paciente' && req.usuario.pacienteId !== pacienteId) {
      throw new ForbiddenException('Solo puedes actualizar tu propia preferencia de idioma');
    }
    return this.identidadService.actualizarIdiomaPaciente(pacienteId, body.idioma);
  }
}
