import { Global, Module } from '@nestjs/common';
import { CanalesController } from './canales.controller';
import { CanalesService } from './canales.service';

@Global()
@Module({
  controllers: [CanalesController],
  providers: [CanalesService],
  exports: [CanalesService],
})
export class CanalesModule {}
