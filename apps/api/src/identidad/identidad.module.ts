import { Global, Module } from '@nestjs/common';
import { IdentidadController } from './identidad.controller';
import { IdentityResolverService } from './identidad.service';
import { PacienteStoreService } from './paciente-store.service';

@Global()
@Module({
  controllers: [IdentidadController],
  providers: [PacienteStoreService, IdentityResolverService],
  exports: [PacienteStoreService, IdentityResolverService],
})
export class IdentidadModule {}
