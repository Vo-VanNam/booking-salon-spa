import { INestApplication, ValidationPipe } from '@nestjs/common';
import { serverConfig } from './common/config';
import { AppLogger } from './common/logger';
import { requestIdMiddleware } from './common/request-id.middleware';
import { validationExceptionFactory } from './common/validation-pipe';

/**
 * Cấu hình HTTP dùng chung cho main.ts và test — tránh drift giữa môi trường chạy thật và test.
 */
export function configureApp(app: INestApplication, options: { withLogger?: boolean } = {}): void {
  const config = serverConfig();
  if (options.withLogger) app.useLogger(new AppLogger('bootstrap'));
  app.use(requestIdMiddleware);
  app.enableCors({
    origin: config.corsOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
}
