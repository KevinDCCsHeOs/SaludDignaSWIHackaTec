import { Global, Module } from '@nestjs/common';
import { CifradoService } from './cifrado.service';
import { ConsentimientoService } from './consentimiento.service';
import { PrivacidadController } from './privacidad.controller';
import { SanitizedLogger } from './sanitizador-logs';

@Global()
@Module({
  controllers: [PrivacidadController],
  providers: [
    CifradoService,
    ConsentimientoService,
    {
      provide: SanitizedLogger,
      useFactory: () => new SanitizedLogger('SaludDignaAPI'),
    },
  ],
  exports: [CifradoService, ConsentimientoService, SanitizedLogger],
})
export class PrivacidadModule {}
