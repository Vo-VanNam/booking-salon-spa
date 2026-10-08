import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { databaseUrl, serverConfig } from './common/config';
import { AppLogger } from './common/logger';

async function bootstrap(): Promise<void> {
  const config = serverConfig();
  const logger = new AppLogger('bootstrap');
  databaseUrl(); // thiếu DATABASE_URL thì dừng ngay, không chạy nửa vời.

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app, { withLogger: true });
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  logger.log('API đã sẵn sàng', { port: config.port, cors: config.corsOrigins === true ? 'any' : config.corsOrigins });
}

void bootstrap();
