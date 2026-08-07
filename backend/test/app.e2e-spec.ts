// Defaults để e2e chạy được cả khi thiếu .env (giá trị .env vẫn được ưu tiên)
process.env.DATABASE_URL ??=
  'postgresql://salon:salon_dev_password@localhost:5432/salon_spa?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.CORS_ORIGIN ??= 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET ??=
  'e2e-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET ??=
  'e2e-refresh-secret-at-least-32-characters-long';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/health (GET) — db + redis up, có header x-request-id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    const body = res.body as { status: string; db: string; redis: string };
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(body.redis).toBe('up');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('/api/nonexistent (GET) — 404 message tiếng Việt + requestId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/nonexistent')
      .expect(404);
    const body = res.body as {
      message: string;
      requestId: string;
      path: string;
    };
    expect(body.message).toBe('Không tìm thấy đường dẫn yêu cầu');
    expect(body.requestId).toBeDefined();
    expect(body.path).toBe('/api/nonexistent');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
