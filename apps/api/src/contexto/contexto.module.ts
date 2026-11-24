import { Global, Module } from '@nestjs/common';
import { ContextoController } from './contexto.controller';
import { ContextoService } from './contexto.service';

@Global()
@Module({
  controllers: [ContextoController],
  providers: [ContextoService],
  exports: [ContextoService],
})
export class ContextoModule {}
