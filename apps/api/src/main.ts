import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { crearEstadoSaludApi } from './health.controller';
import { SanitizedLogger } from './privacidad/sanitizador-logs';
import { RealtimeGatewayService } from './realtime/realtime.gateway';

export { crearEstadoSaludApi };

export async function crearAppNest(opciones?: { silencioso?: boolean }): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: opciones?.silencioso ? false : new SanitizedLogger('SaludDignaAPI'),
  });
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_BASE_URL ?? true,
    credentials: true,
  });

  // Adjuntar Socket.IO al mismo servidor HTTP (autenticado con JWT, #14)
  const realtime = app.get(RealtimeGatewayService);
  realtime.adjuntarAServidorHttp(app.getHttpServer() as HttpServer);

  return app;
}

if (require.main === module) {
  const puerto = Number(process.env.PORT ?? 3000);
  void crearAppNest().then(async (app) => {
    await app.listen(puerto);
    console.log(
      `[api] Núcleo NestJS + Socket.IO escuchando en http://localhost:${puerto} (GET /health)`,
    );
  });
}
