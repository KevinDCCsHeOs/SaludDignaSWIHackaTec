import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CanalesModule } from '../canales/canales.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { OtpModule } from '../otp/otp.module';
import { PrivacidadModule } from '../privacidad/privacidad.module';
import { TramitesModule } from '../tramites/tramites.module';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';

@Module({
  imports: [
    IdentidadModule,
    PrivacidadModule,
    CanalesModule,
    TramitesModule,
    AuditoriaModule,
    OtpModule,
  ],
  controllers: [AlertasController],
  providers: [AlertasService],
  exports: [AlertasService],
})
export class AlertasModule {}
