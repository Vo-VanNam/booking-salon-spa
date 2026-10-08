import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { env } from '../common/config';
import { VN_TIMEZONE } from '../common/time';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** GET /health — kiểm tra cả Postgres lẫn Redis (DOCUMENT.md §5). */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response) {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }

    const redisPing = await this.redis.ping();
    const redis = env('REDIS_URL') ? (redisPing ? 'ok' : 'down') : 'disabled';

    const healthy = db === 'ok';
    if (!healthy) response.status(503);

    return {
      status: healthy ? 'ok' : 'error',
      db,
      redis,
      time: new Date().toISOString(),
      timezone: VN_TIMEZONE,
      uptime_seconds: Math.round(process.uptime()),
      version: env('APP_VERSION', '1.0.0'),
    };
  }
}
