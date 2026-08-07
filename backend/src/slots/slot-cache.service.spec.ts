import { RedisService } from '../redis/redis.service';
import { DayContext } from './slot-engine.service';
import { SlotCacheService } from './slot-cache.service';

describe('SlotCacheService', () => {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
  };
  const cache = new SlotCacheService(redis as unknown as RedisService);

  beforeEach(() => jest.clearAllMocks());

  const context: DayContext = {
    workingStart: new Date('2026-08-08T02:00:00.000Z'),
    workingEnd: new Date('2026-08-08T14:00:00.000Z'),
    busy: [
      {
        start: new Date('2026-08-08T07:00:00.000Z'),
        end: new Date('2026-08-08T08:00:00.000Z'),
      },
    ],
  };

  it('getKey đúng định dạng slots:{branchId}:{stylistId}:{dateStr}', () => {
    expect(cache.getKey('b1', 's1', '2026-08-08')).toBe(
      'slots:b1:s1:2026-08-08',
    );
  });

  it('setContext gọi redis.set với JSON và TTL 30 giây', async () => {
    await cache.setContext('b1', 's1', '2026-08-08', context);
    expect(redis.set).toHaveBeenCalledWith(
      'slots:b1:s1:2026-08-08',
      JSON.stringify({
        workingStart: '2026-08-08T02:00:00.000Z',
        workingEnd: '2026-08-08T14:00:00.000Z',
        busy: [
          {
            start: '2026-08-08T07:00:00.000Z',
            end: '2026-08-08T08:00:00.000Z',
          },
        ],
      }),
      30,
    );
  });

  it('getContext đọc key và parse về DayContext đúng', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({
        workingStart: '2026-08-08T02:00:00.000Z',
        workingEnd: '2026-08-08T14:00:00.000Z',
        busy: [
          {
            start: '2026-08-08T07:00:00.000Z',
            end: '2026-08-08T08:00:00.000Z',
          },
        ],
      }),
    );
    const result = await cache.getContext('b1', 's1', '2026-08-08');
    expect(redis.get).toHaveBeenCalledWith('slots:b1:s1:2026-08-08');
    expect(result).toEqual(context);
  });

  it('getContext không có key → null', async () => {
    redis.get.mockResolvedValue(null);
    await expect(
      cache.getContext('b1', 's1', '2026-08-08'),
    ).resolves.toBeNull();
  });

  it('getContext JSON hỏng → null (coi như miss)', async () => {
    redis.get.mockResolvedValue('{không phải json');
    await expect(
      cache.getContext('b1', 's1', '2026-08-08'),
    ).resolves.toBeNull();
  });

  it('invalidate scan pattern đúng và del mọi key trúng', async () => {
    redis.scan.mockResolvedValue([
      'slots:b1:s1:2026-08-08',
      'slots:b2:s1:2026-08-08',
    ]);
    await cache.invalidate('s1', '2026-08-08');
    expect(redis.scan).toHaveBeenCalledWith('slots:*:s1:2026-08-08');
    expect(redis.del).toHaveBeenCalledWith(
      'slots:b1:s1:2026-08-08',
      'slots:b2:s1:2026-08-08',
    );
  });

  it('invalidate không có key nào → không gọi del', async () => {
    redis.scan.mockResolvedValue([]);
    await cache.invalidate('s1', '2026-08-08');
    expect(redis.del).not.toHaveBeenCalled();
  });
});
