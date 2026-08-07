import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DayContext } from './slot-engine.service';

export const SLOT_CACHE_TTL_SECONDS = 30;

interface CachedDayContext {
  workingStart: string;
  workingEnd: string;
  busy: { start: string; end: string }[];
}

@Injectable()
export class SlotCacheService {
  constructor(private readonly redis: RedisService) {}

  getKey(branchId: string, stylistId: string, dateStr: string): string {
    return `slots:${branchId}:${stylistId}:${dateStr}`;
  }

  async getContext(
    branchId: string,
    stylistId: string,
    dateStr: string,
  ): Promise<DayContext | null> {
    const raw = await this.redis.get(this.getKey(branchId, stylistId, dateStr));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as CachedDayContext;
      return {
        workingStart: new Date(parsed.workingStart),
        workingEnd: new Date(parsed.workingEnd),
        busy: parsed.busy.map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        })),
      };
    } catch {
      // Cache hỏng format thì coi như miss, dựng lại từ DB
      return null;
    }
  }

  async setContext(
    branchId: string,
    stylistId: string,
    dateStr: string,
    context: DayContext,
  ): Promise<void> {
    const value: CachedDayContext = {
      workingStart: context.workingStart.toISOString(),
      workingEnd: context.workingEnd.toISOString(),
      busy: context.busy.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
      })),
    };
    await this.redis.set(
      this.getKey(branchId, stylistId, dateStr),
      JSON.stringify(value),
      SLOT_CACHE_TTL_SECONDS,
    );
  }

  // Xóa mọi key slots của stylist theo ngày, không cần biết branchId
  async invalidate(stylistId: string, dateStr: string): Promise<void> {
    const keys = await this.redis.scan(`slots:*:${stylistId}:${dateStr}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
