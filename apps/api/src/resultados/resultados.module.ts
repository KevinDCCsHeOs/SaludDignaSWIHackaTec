import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CanalesModule } from '../canales/canales.module';
import { CatalogosModule } from '../catalogos/catalogos.module';
import { EventosModule } from '../eventos/eventos.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { TramitesModule } from '../tramites/tramites.module';
import { ResultadosController } from './resultados.controller';
import { ResultadosService } from './resultados.service';

@Module({
  imports: [
    CatalogosModule,
    TramitesModule,
    IdentidadModule,
    EventosModule,
    AuditoriaModule,
    CanalesModule,
  ],
  controllers: [ResultadosController],
  providers: [ResultadosService],
  exports: [ResultadosService],
})
export class ResultadosModule {}
