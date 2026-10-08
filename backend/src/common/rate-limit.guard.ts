import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { trustProxyEnabled } from '../common/config';
import { RedisService } from '../redis/redis.service';

export interface RateLimitOptions {
  /** Tên nhóm (xuất hiện trong key Redis). */
  key: string;
  /** Số request tối đa trong một cửa sổ. */
  limit: number;
  windowSeconds: number;
  by?: 'ip' | 'user';
}

export const RATE_LIMIT_KEY = 'rate_limit_options';

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

const buckets = new Map<string, { count: number; expiresAt: number }>();

/** Bộ đếm dự phòng khi Redis không sẵn sàng (cửa sổ cố định, theo tiến trình). */
function memoryIncrement(key: string, windowMs: number): number {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [bucketKey, entry] of buckets) {
      if (entry.expiresAt <= now) buckets.delete(bucketKey);
    }
  }
  const existing = buckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export function clientIp(request: Request): string {
  // Khi chạy sau reverse proxy (TRUST_PROXY=true), X-Real-IP do nginx ghi đè bằng $remote_addr
  // nên tin được. Khi KHÔNG có proxy, mọi header đều do client tự khai → chỉ dùng địa chỉ socket,
  // nhờ vậy không thể giả mạo IP để né rate limit.
  if (trustProxyEnabled()) {
    const realIp = request.headers['x-real-ip'];
    const value = Array.isArray(realIp) ? realIp[0] : realIp;
    if (value && value.trim()) return value.trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}

/**
 * Rate limit dùng Redis (đếm dùng chung giữa các instance), tự hạ cấp sang bộ đếm trong tiến trình
 * khi Redis không khả dụng. Áp dụng cho các endpoint công khai dễ bị lạm dụng (DOCUMENT.md §5).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { id?: string } }>();
    const response = http.getResponse<Response>();

    const identity =
      options.by === 'user' && request.user?.id ? `user:${request.user.id}` : `ip:${clientIp(request)}`;
    const windowMs = options.windowSeconds * 1000;
    const windowIndex = Math.floor(Date.now() / windowMs);
    const key = `rl:${options.key}:${identity}:${windowIndex}`;

    const distributed = await this.redis.incrWithTtl(key, options.windowSeconds + 2);
    const count = distributed ?? memoryIncrement(key, windowMs);

    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.limit - count)));

    if (count > options.limit) {
      throw new HttpException(
        {
          statusCode: 429,
          message: `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${options.windowSeconds} giây.`,
          code: 'RATE_LIMITED',
        },
        429,
      );
    }
    return true;
  }
}
