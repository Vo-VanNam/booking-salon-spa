import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import { SlotCacheService } from './slot-cache.service';
import { SlotEngineService } from './slot-engine.service';
import { SlotsService } from './slots.service';

describe('SlotsService', () => {
  const prisma = {
    branch: { findFirst: jest.fn() },
    stylist: { findFirst: jest.fn() },
    workingHour: { findMany: jest.fn() },
    timeOff: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
  };
  const cache = {
    getContext: jest.fn(),
    setContext: jest.fn(),
    invalidate: jest.fn(),
  };
  const service = new SlotsService(
    prisma as unknown as PrismaService,
    cache as unknown as SlotCacheService,
    new SlotEngineService(new TimeService()),
    new TimeService(),
  );

  beforeEach(() => jest.clearAllMocks());

  // Thứ 7 → dayOfWeek = 6
  const DATE = '2026-08-08';
  const at = (h: number, m = 0): Date =>
    new Date(Date.UTC(2026, 7, 8, h - 7, m)); // giờ VN (UTC+7) → UTC

  const fullDayCache = {
    workingStart: at(9),
    workingEnd: at(21),
    busy: [] as { start: Date; end: Date }[],
  };

  it('cache hit: dựng slot từ cache, không gọi DB', async () => {
    cache.getContext.mockResolvedValue(fullDayCache);

    const result = await service.getSlots('b1', 's1', DATE, 30);

    expect(result.date).toBe(DATE);
    expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(result.reason).toBeUndefined();
    expect(result.slots).toHaveLength(47);
    expect(result.slots[0]).toBe('09:00');
    expect(result.slots[result.slots.length - 1]).toBe('20:30');
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
    expect(prisma.stylist.findFirst).not.toHaveBeenCalled();
    expect(prisma.workingHour.findMany).not.toHaveBeenCalled();
    expect(prisma.timeOff.findMany).not.toHaveBeenCalled();
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    expect(cache.setContext).not.toHaveBeenCalled();
  });

  it('cache miss: query đúng WorkingHour/TimeOff/Booking rồi lưu context', async () => {
    cache.getContext.mockResolvedValue(null);
    prisma.branch.findFirst.mockResolvedValue({
      id: 'b1',
      openTime: '09:00',
      closeTime: '21:00',
    });
    prisma.stylist.findFirst.mockResolvedValue({ id: 's1', branchId: 'b1' });
    prisma.workingHour.findMany.mockResolvedValue([
      { dayOfWeek: 6, startTime: '09:00', endTime: '21:00' },
    ]);
    prisma.timeOff.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([
      { startTime: at(14), endTime: at(15) }, // booking 14:00-15:00
    ]);

    const result = await service.getSlots('b1', 's1', DATE, 30);

    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'b1', active: true },
      select: { id: true, openTime: true, closeTime: true },
    });
    expect(prisma.stylist.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', active: true },
      select: { id: true, branchId: true },
    });
    expect(prisma.workingHour.findMany).toHaveBeenCalledWith({
      where: { stylistId: 's1', dayOfWeek: 6 },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    });
    expect(prisma.timeOff.findMany).toHaveBeenCalledWith({
      where: {
        stylistId: 's1',
        startTime: { lt: new Date('2026-08-08T17:00:00.000Z') },
        endTime: { gt: new Date('2026-08-07T17:00:00.000Z') },
      },
      select: { startTime: true, endTime: true },
    });
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        stylistId: 's1',
        status: { in: [BookingStatus.pending, BookingStatus.confirmed] },
        startTime: { lt: new Date('2026-08-08T17:00:00.000Z') },
        endTime: { gt: new Date('2026-08-07T17:00:00.000Z') },
      },
      select: { startTime: true, endTime: true },
    });
    expect(cache.setContext).toHaveBeenCalledWith('b1', 's1', DATE, {
      workingStart: at(9),
      workingEnd: at(21),
      busy: [{ start: at(14), end: at(15) }],
    });
    // Booking 14:00-15:00 chặn slot 13:45..14:45, 15:00 vẫn còn
    expect(result.slots).toHaveLength(42);
    expect(result.slots).not.toContain('13:45');
    expect(result.slots).not.toContain('14:30');
    expect(result.slots).toContain('13:30');
    expect(result.slots).toContain('15:00');
  });

  it('branch không tồn tại/inactive → throw Không tìm thấy chi nhánh', async () => {
    cache.getContext.mockResolvedValue(null);
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(service.getSlots('b1', 's1', DATE, 30)).rejects.toThrow(
      'Không tìm thấy chi nhánh',
    );
  });

  it('stylist không tồn tại/inactive → throw Không tìm thấy stylist', async () => {
    cache.getContext.mockResolvedValue(null);
    prisma.branch.findFirst.mockResolvedValue({
      id: 'b1',
      openTime: '09:00',
      closeTime: '21:00',
    });
    prisma.stylist.findFirst.mockResolvedValue(null);

    await expect(service.getSlots('b1', 's1', DATE, 30)).rejects.toThrow(
      'Không tìm thấy stylist',
    );
  });

  it('stylist thuộc branch khác → throw Stylist không thuộc chi nhánh này', async () => {
    cache.getContext.mockResolvedValue(null);
    prisma.branch.findFirst.mockResolvedValue({
      id: 'b1',
      openTime: '09:00',
      closeTime: '21:00',
    });
    prisma.stylist.findFirst.mockResolvedValue({ id: 's1', branchId: 'b2' });

    await expect(service.getSlots('b1', 's1', DATE, 30)).rejects.toThrow(
      'Stylist không thuộc chi nhánh này',
    );
  });

  it('stylist nghỉ ngày đó → slots rỗng kèm reason, không cache', async () => {
    cache.getContext.mockResolvedValue(null);
    prisma.branch.findFirst.mockResolvedValue({
      id: 'b1',
      openTime: '09:00',
      closeTime: '21:00',
    });
    prisma.stylist.findFirst.mockResolvedValue({ id: 's1', branchId: 'b1' });
    prisma.workingHour.findMany.mockResolvedValue([]);
    prisma.timeOff.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);

    const result = await service.getSlots('b1', 's1', DATE, 30);

    expect(result.slots).toEqual([]);
    expect(result.reason).toBe('Stylist không làm việc vào ngày này');
    expect(cache.setContext).not.toHaveBeenCalled();
  });

  it('invalidateForBooking tính dateStr theo giờ VN từ startTime', async () => {
    // 2026-08-07T17:00:00Z = 2026-08-08 00:00 giờ VN
    await service.invalidateForBooking(
      's1',
      new Date('2026-08-07T17:00:00.000Z'),
    );
    expect(cache.invalidate).toHaveBeenCalledWith('s1', '2026-08-08');
  });
});
