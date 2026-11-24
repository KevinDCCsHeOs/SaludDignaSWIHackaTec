import { Module } from '@nestjs/common';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { CanalesModule } from './canales/canales.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { CommonModule } from './common/common.module';
import { ContextoModule } from './contexto/contexto.module';
import { EventosModule } from './eventos/eventos.module';
import { HealthController } from './health.controller';
import { IdentidadModule } from './identidad/identidad.module';
import { OtpModule } from './otp/otp.module';
import { PrivacidadModule } from './privacidad/privacidad.module';
import { RealtimeModule } from './realtime/realtime.module';
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
    ContextoModule,
    TimelineModule,
    TicketsModule,
    CanalesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
