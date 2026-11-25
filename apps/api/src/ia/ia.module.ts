import { Module } from '@nestjs/common';
import { CanalesModule } from '../canales/canales.module';
import { CatalogosModule } from '../catalogos/catalogos.module';
import { ContextoModule } from '../contexto/contexto.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { OtpModule } from '../otp/otp.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TramitesModule } from '../tramites/tramites.module';
import { IaController } from './ia.controller';
import { IaService } from './ia.service';
import { ProveedorLlmService } from './proveedor-llm';
import { VigenciasService } from './vigencias.service';

@Module({
  imports: [
    CatalogosModule,
    ContextoModule,
    IdentidadModule,
    OtpModule,
    TicketsModule,
    TramitesModule,
    CanalesModule,
  ],
  controllers: [IaController],
  providers: [ProveedorLlmService, IaService, VigenciasService],
  exports: [IaService, VigenciasService],
})
export class IaModule {}
