import { Global, Module } from '@nestjs/common';
import { EventPublisherService } from './eventos/event-publisher.service';
import { PersistenciaService } from './persistencia/persistencia.service';
import { PrismaService } from './prisma/prisma.service';
import { KeyValueStoreService } from './redis/kv-store.service';

@Global()
@Module({
  providers: [KeyValueStoreService, EventPublisherService, PrismaService, PersistenciaService],
  exports: [KeyValueStoreService, EventPublisherService, PrismaService, PersistenciaService],
})
export class CommonModule {}
