import { Module } from '@nestjs/common';
import { TemporizadoresController } from './temporizadores.controller';
import { TemporizadoresService } from './temporizadores.service';

@Module({
  controllers: [TemporizadoresController],
  providers: [TemporizadoresService],
  exports: [TemporizadoresService],
})
export class TemporizadoresModule {}
