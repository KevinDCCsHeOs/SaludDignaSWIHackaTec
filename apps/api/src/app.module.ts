import { Module } from '@nestjs/common';
import { AlertasModule } from './alertas/alertas.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { CanalesModule } from './canales/canales.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { CommonModule } from './common/common.module';
import { ContextoModule } from './contexto/contexto.module';
import { EventosModule } from './eventos/eventos.module';
import { FacturacionModule } from './facturacion/facturacion.module';
import { HealthController } from './health.controller';
import { IaModule } from './ia/ia.module';
import { IdentidadModule } from './identidad/identidad.module';
import { MetricasModule } from './metricas/metricas.module';
import { OtpModule } from './otp/otp.module';
import { PrivacidadModule } from './privacidad/privacidad.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ResultadosModule } from './resultados/resultados.module';
import { ServicioModule } from './servicio/servicio.module';
import { TemporizadoresModule } from './temporizadores/temporizadores.module';
import { TicketsModule } from './tickets/tickets.module';
import { TimelineModule } from './timeline/timeline.module';
import { TramitesModule } from './tramites/tramites.module';

@Module({
  imports: [
    CommonModule,
    EventosModule,
    RealtimeModule,
    PrivacidadModule,
    AuditoriaModule,
    CatalogosModule,
    IdentidadModule,
    OtpModule,
    AuthModule,
    TramitesModule,
    TemporizadoresModule,
    ContextoModule,
    TimelineModule,
    TicketsModule,
    CanalesModule,
    ResultadosModule,
    ServicioModule,
    IaModule,
    MetricasModule,
    AlertasModule,
    FacturacionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
