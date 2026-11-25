import { Module } from '@nestjs/common';
import { EventosModule } from '../eventos/eventos.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { ResultadosModule } from '../resultados/resultados.module';
import { ServicioModule } from '../servicio/servicio.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TimelineModule } from '../timeline/timeline.module';
import { TramitesModule } from '../tramites/tramites.module';
import { MetricasController } from './metricas.controller';
import { MetricasService } from './metricas.service';

@Module({
  imports: [
    EventosModule,
    TramitesModule,
    TicketsModule,
    ResultadosModule,
    ServicioModule,
    IdentidadModule,
    TimelineModule,
  ],
  controllers: [MetricasController],
  providers: [MetricasService],
  exports: [MetricasService],
})
export class MetricasModule {}
