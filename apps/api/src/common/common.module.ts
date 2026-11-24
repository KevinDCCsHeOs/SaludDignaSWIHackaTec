import { Global, Module } from '@nestjs/common';
import { EventPublisherService } from './eventos/event-publisher.service';
import { PrismaService } from './prisma/prisma.service';
import { KeyValueStoreService } from './redis/kv-store.service';

@Global()
@Module({
  providers: [KeyValueStoreService, EventPublisherService, PrismaService],
  exports: [KeyValueStoreService, EventPublisherService, PrismaService],
})
export class CommonModule {}
