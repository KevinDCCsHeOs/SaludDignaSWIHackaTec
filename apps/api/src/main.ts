import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { crearEstadoSaludApi } from './health.controller';
import { SanitizedLogger } from './privacidad/sanitizador-logs';

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
  return app;
}

if (require.main === module) {
  const puerto = Number(process.env.PORT ?? 3000);
  void crearAppNest().then(async (app) => {
    await app.listen(puerto);
    console.log(`[api] Núcleo NestJS escuchando en http://localhost:${puerto} (GET /health)`);
  });
}
