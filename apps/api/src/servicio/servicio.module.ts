import { Module } from '@nestjs/common';
import { CatalogosModule } from '../catalogos/catalogos.module';
import { OtpModule } from '../otp/otp.module';
import { ResultadosModule } from '../resultados/resultados.module';
import { TramitesModule } from '../tramites/tramites.module';
import { ServicioController } from './servicio.controller';
import { ServicioService } from './servicio.service';

@Module({
  imports: [CatalogosModule, TramitesModule, ResultadosModule, OtpModule],
  controllers: [ServicioController],
  providers: [ServicioService],
  exports: [ServicioService],
})
export class ServicioModule {}
