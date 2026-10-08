import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../common/config';
import { AppLogger } from '../common/logger';

/**
 * Redis tuỳ chọn: dùng cho cache slot trống, rate limit và lịch sử hội thoại AI.
 * Mọi phương thức đều "an toàn khi thiếu Redis" — mất Redis không được làm hỏng luồng đặt lịch.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger('redis');
  private client: Redis | null = null;
  private available = false;

  async onModuleInit(): Promise<void> {
    const url = env('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL chưa cấu hình — cache/queue sẽ bị bỏ qua');
      return;
    }
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    client.on('error', (error: Error) => {
      if (this.available) this.logger.warn('Redis gặp lỗi kết nối', { message: error.message });
      this.available = false;
    });
    client.on('ready', () => {
      this.available = true;
    });
    client.on('end', () => {
      this.available = false;
    });
    try {
      await client.connect();
      this.client = client;
      this.available = true;
      this.logger.log('Đã kết nối Redis');
    } catch (error) {
      this.logger.warn('Không kết nối được Redis — tiếp tục không có cache', {
        message: error instanceof Error ? error.message : String(error),
      });
      client.disconnect();
      this.client = null;
      this.available = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.client?.disconnect();
    } catch {
      /* bỏ qua */
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttlSeconds && ttlSeconds > 0) await this.client.set(key, value, 'EX', ttlSeconds);
      else await this.client.set(key, value);
      return true;
    } catch {
      return false;
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.client || keys.length === 0) return 0;
    try {
      return await this.client.del(...keys);
    } catch {
      return 0;
    }
  }

  /** Xoá theo tiền tố bằng SCAN (không dùng KEYS để tránh chặn Redis). */
  async delByPrefix(prefix: string, maxKeys = 2000): Promise<number> {
    if (!this.client) return 0;
    try {
      let cursor = '0';
      let deleted = 0;
      do {
        const [nextCursor, found] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = nextCursor;
        if (found.length > 0) {
          deleted += await this.client.del(...found);
          if (deleted >= maxKeys) break;
        }
      } while (cursor !== '0');
      return deleted;
    } catch {
      return 0;
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.incr(key);
      if (value === 1) await this.client.expire(key, ttlSeconds);
      return value;
    } catch {
      return null;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      // Chưa cấu hình Redis cũng không phải lỗi: health check báo "disabled".
      return false;
    }
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async pushJson(key: string, value: unknown, ttlSeconds: number, maxItems = 40): Promise<void> {
    const existing = await this.get(key);
    let items: unknown[] = [];
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    }
    items.push(value);
    if (items.length > maxItems) items = items.slice(items.length - maxItems);
    await this.set(key, JSON.stringify(items), ttlSeconds);
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
