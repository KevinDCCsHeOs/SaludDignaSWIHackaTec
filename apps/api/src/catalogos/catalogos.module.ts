import { Global, Module } from '@nestjs/common';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Global()
@Module({
  controllers: [CatalogosController],
  providers: [CatalogosService],
  exports: [CatalogosService],
})
export class CatalogosModule {}
