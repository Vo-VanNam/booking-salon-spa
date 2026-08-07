import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService, VN_TIMEZONE } from '../time/time.service';
import { StylistService } from './stylist.service';

describe('StylistService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    stylist: { findUnique: jest.fn() },
    booking: { findMany: jest.fn() },
  };
  const service = new StylistService(
    prisma as unknown as PrismaService,
    new TimeService(),
  );

  beforeEach(() => jest.clearAllMocks());

  const stylistRow = {
    id: 'st1',
    name: 'Nguyễn Văn Hùng',
    phone: '0901234001',
    email: 'hung.nguyen@salonglow.vn',
    avatarUrl: null,
    branch: {
      id: 'b1',
      name: 'Salon Glow Quận 1',
      address: '123 Lê Lợi',
      openTime: '09:00',
      closeTime: '21:00',
    },
    workingHours: [{ dayOfWeek: 0, startTime: '09:00', endTime: '21:00' }],
    timeOffs: [],
  };

  it('me: user có stylistId → trả thông tin stylist kèm branch/workingHours/timeOffs', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: 'st1' });
    prisma.stylist.findUnique.mockResolvedValue(stylistRow);
    const result = await service.getMe('u1');
    expect(result).toEqual(stylistRow);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { stylistId: true },
    });
    const call = prisma.stylist.findUnique.mock.calls[0] as unknown as [
      {
        where: { id: string };
        select: { branch: unknown; workingHours: unknown; timeOffs: unknown };
      },
    ];
    const callArg = call[0];
    expect(callArg.where).toEqual({ id: 'st1' });
    expect(callArg.select.branch).toBeDefined();
    expect(callArg.select.workingHours).toBeDefined();
    expect(callArg.select.timeOffs).toBeDefined();
  });

  it('me: user không có stylistId → 403 "Tài khoản không liên kết với stylist"', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: null });
    await expect(service.getMe('u1')).rejects.toThrow(
      'Tài khoản không liên kết với stylist',
    );
    expect(prisma.stylist.findUnique).not.toHaveBeenCalled();
  });

  it('me: user không tồn tại → 403 cùng message', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getMe('u1')).rejects.toThrow(
      'Tài khoản không liên kết với stylist',
    );
  });

  it('bookings: user không có stylistId → 403, không query booking', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: null });
    await expect(
      service.getBookings('u1', '2026-08-07', '2026-08-09'),
    ).rejects.toThrow('Tài khoản không liên kết với stylist');
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('bookings: query đúng khoảng UTC [from 00:00 VN, to+1 ngày 00:00 VN)', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: 'st1' });
    prisma.booking.findMany.mockResolvedValue([]);
    await service.getBookings('u1', '2026-08-07', '2026-08-09');
    const call = prisma.booking.findMany.mock.calls[0] as unknown as [
      {
        where: {
          stylistId: string;
          startTime: { gte: Date; lt: Date };
        };
        select: unknown;
        orderBy: { startTime: string };
      },
    ];
    const callArg = call[0];
    expect(callArg.where).toEqual({
      stylistId: 'st1',
      startTime: {
        gte: new Date('2026-08-06T17:00:00.000Z'),
        lt: new Date('2026-08-09T17:00:00.000Z'),
      },
    });
    expect(callArg.select).toBeDefined();
    expect(callArg.orderBy).toEqual({ startTime: 'asc' });
  });

  it('bookings: ngày sai định dạng → 400 "Ngày không hợp lệ"', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: 'st1' });
    await expect(
      service.getBookings('u1', '07/08/2026', '2026-08-09'),
    ).rejects.toThrow('Ngày không hợp lệ');
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('bookings: ngày không tồn tại (2026-13-45) → 400 "Ngày không hợp lệ"', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: 'st1' });
    await expect(
      service.getBookings('u1', '2026-13-45', '2026-08-09'),
    ).rejects.toThrow('Ngày không hợp lệ');
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('today: dùng from=to=hôm nay VN → range [hôm nay 00:00, ngày mai 00:00) VN', async () => {
    prisma.user.findUnique.mockResolvedValue({ stylistId: 'st1' });
    prisma.booking.findMany.mockResolvedValue([]);
    await service.getTodayBookings('u1');
    const today = DateTime.now().setZone(VN_TIMEZONE).toFormat('yyyy-MM-dd');
    const dayStart = DateTime.fromFormat(today, 'yyyy-MM-dd', {
      zone: VN_TIMEZONE,
    });
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stylistId: 'st1',
          startTime: {
            gte: dayStart.toUTC().toJSDate(),
            lt: dayStart.plus({ days: 1 }).toUTC().toJSDate(),
          },
        },
      }),
    );
  });
});
