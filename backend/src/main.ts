import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const log = new Logger('Arranque');

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  // CORS sólo hace falta si la PWA se sirve desde otro dominio.
  const origenes = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  if (origenes?.length) app.enableCors({ origin: origenes });

  // En producción la API también sirve la PWA compilada: un solo servicio que desplegar.
  const webDir = process.env.WEB_DIR ?? join(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(join(webDir, 'index.html'))) {
    app.useStaticAssets(webDir, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(join(webDir, 'index.html'));
    });
    log.log(`Sirviendo PWA desde ${webDir}`);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  log.log(`API escuchando en el puerto ${port}`);
}

bootstrap();
