import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface HealthResult {
  status: 'ok' | 'error';
  db: 'up' | 'down';
  redis: 'up' | 'down';
  uptime: number;
  timestamp: string;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<HealthResult> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const result: HealthResult = {
      status: db === 'up' && redis === 'up' ? 'ok' : 'error',
      db,
      redis,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    if (result.status === 'error') {
      // Body chi tiết được filter giữ nguyên trong message
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  private async checkDb(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
