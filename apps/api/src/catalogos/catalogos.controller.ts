import { Controller, Get, Param, Query } from '@nestjs/common';
import type { CategoriaEstudio, EstatusClinica } from '@salud-digna/shared';
import { Publico } from '../auth/decoradores';
import { CatalogosService } from './catalogos.service';

@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Publico()
  @Get('estudios')
  listarEstudios(@Query('categoria') categoria?: CategoriaEstudio, @Query('q') q?: string) {
    const estudios = this.catalogos.listarEstudios({ categoria, q });
    return { total: estudios.length, estudios };
  }

  @Publico()
  @Get('estudios/:id')
  obtenerEstudio(@Param('id') id: string) {
    return this.catalogos.obtenerEstudioPorId(id);
  }

  @Publico()
  @Get('clinicas')
  listarClinicas(@Query('region') region?: string, @Query('estatus') estatus?: EstatusClinica) {
    const clinicas = this.catalogos.listarClinicas({ region, estatus });
    return { total: clinicas.length, clinicas };
  }

  @Publico()
  @Get('clinicas/:id')
  obtenerClinica(@Param('id') id: string) {
    return this.catalogos.obtenerClinicaPorId(id);
  }
}
