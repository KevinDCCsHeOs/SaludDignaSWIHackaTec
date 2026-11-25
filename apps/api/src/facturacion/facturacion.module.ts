import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CanalesModule } from '../canales/canales.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { OtpModule } from '../otp/otp.module';
import { TramitesModule } from '../tramites/tramites.module';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';

@Module({
  imports: [IdentidadModule, TramitesModule, CanalesModule, AuditoriaModule, OtpModule],
  controllers: [FacturacionController],
  providers: [FacturacionService],
  exports: [FacturacionService],
})
export class FacturacionModule {}
