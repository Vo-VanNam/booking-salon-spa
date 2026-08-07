import { BookingStatus, DepositStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { BookingConflictException } from '../common/exceptions/booking-conflict.exception';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';
import { SlotEngineService } from '../slots/slot-engine.service';
import { SlotsService } from '../slots/slots.service';
import { TimeService, VN_TIMEZONE } from '../time/time.service';
import { BookingService } from './bookings.service';

describe('BookingService', () => {
  const tx = {
    branch: { findFirst: jest.fn() },
    service: { findFirst: jest.fn() },
    stylist: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    timeOff: { findMany: jest.fn() },
    workingHour: { findFirst: jest.fn() },
    booking: { create: jest.fn() },
    $queryRaw: jest.fn() as jest.Mock<unknown[], [Prisma.Sql]>,
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const slotsService = { invalidateForBooking: jest.fn() };
  const loyaltyService = { applyDiscountForNextBooking: jest.fn() };
  const remindersService = {
    scheduleForBooking: jest.fn(),
    unscheduleForBooking: jest.fn(),
  };
  const service = new BookingService(
    prisma as unknown as PrismaService,
    new TimeService(),
    new SlotEngineService(new TimeService()),
    slotsService as unknown as SlotsService,
    loyaltyService as unknown as LoyaltyService,
    remindersService as unknown as RemindersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    loyaltyService.applyDiscountForNextBooking.mockResolvedValue(0);
  });

  const future = DateTime.now()
    .plus({ days: 2 })
    .setZone(VN_TIMEZONE)
    .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  const dateStr = future.toFormat('yyyy-MM-dd');
  const weekday = new TimeService().vnDayOfWeek(dateStr);
  const userId = 'u1';
  const baseDto = {
    branchId: 'b1',
    serviceId: 'sv1',
    stylistId: 's1',
    startTime: future.toISO()!,
  };

  const setupValid = () => {
    tx.branch.findFirst.mockResolvedValue({
      id: 'b1',
      openTime: '09:00',
      closeTime: '21:00',
    });
    tx.service.findFirst.mockResolvedValue({
      id: 'sv1',
      branchId: 'b1',
      price: 200000,
      durationMinutes: 45,
    });
    tx.stylist.findFirst.mockResolvedValue({ id: 's1', branchId: 'b1' });
    tx.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'customer',
      customerId: 'c1',
    });
    tx.customer.findUnique.mockResolvedValue({
      id: 'c1',
      loyaltyPoints: 0,
    });
    tx.timeOff.findMany.mockResolvedValue([]);
    tx.workingHour.findFirst.mockResolvedValue({
      id: 'wh1',
      dayOfWeek: weekday,
      startTime: '09:00',
      endTime: '21:00',
    });
    tx.$queryRaw.mockResolvedValue([]);
    tx.booking.create.mockResolvedValue({
      id: 'bk1',
      stylistId: 's1',
      startTime: future.toUTC().toJSDate(),
    });
  };

  it('user không phải customer → 403 "Chỉ khách hàng mới có thể đặt lịch"', async () => {
    setupValid();
    tx.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'super_admin',
      customerId: null,
    });
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      'Chỉ khách hàng mới có thể đặt lịch',
    );
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('customer chưa có customerId → 403', async () => {
    setupValid();
    tx.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'customer',
      customerId: null,
    });
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      'Chỉ khách hàng mới có thể đặt lịch',
    );
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('tạo booking hợp lệ: insert đúng data, invalidate cache', async () => {
    setupValid();
    const result = await service.create(baseDto, userId);
    expect(result).toMatchObject({ id: 'bk1' });
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: {
        branchId: 'b1',
        serviceId: 'sv1',
        stylistId: 's1',
        customerId: 'c1',
        startTime: future.toUTC().toJSDate(),
        endTime: future.plus({ minutes: 45 }).toUTC().toJSDate(),
        status: BookingStatus.confirmed,
        priceAtBooking: 200000,
        discountAmount: 0,
        depositAmount: 0,
        depositStatus: DepositStatus.none,
        note: undefined,
      },
    });
    expect(slotsService.invalidateForBooking).toHaveBeenCalledWith(
      's1',
      future.toUTC().toJSDate(),
    );
  });

  it('overlap: conflict query có kết quả → từ chối, không insert', async () => {
    setupValid();
    tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      'Khung giờ này đã có lịch hẹn khác, vui lòng chọn khung giờ khác',
    );
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('conflict query dùng SELECT FOR UPDATE trên Booking', async () => {
    setupValid();
    await service.create(baseDto, userId);
    const sql = tx.$queryRaw.mock.calls[0][0];
    expect(sql.text).toContain('FOR UPDATE');
    expect(sql.text).toContain('"Booking"');
    expect(sql.values).toEqual(
      expect.arrayContaining([
        's1',
        future.toUTC().toJSDate(),
        future.plus({ minutes: 45 }).toUTC().toJSDate(),
      ]),
    );
  });

  it('dịch vụ không tồn tại', async () => {
    setupValid();
    tx.service.findFirst.mockResolvedValue(null);
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      'Dịch vụ không tồn tại',
    );
  });

  it('time off cắt [start, end) → từ chối', async () => {
    setupValid();
    tx.timeOff.findMany.mockResolvedValue([
      {
        startTime: future.minus({ minutes: 30 }).toJSDate(),
        endTime: future.plus({ minutes: 30 }).toJSDate(),
      },
    ]);
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      'Stylist đang nghỉ trong khoảng thời gian này',
    );
  });

  it('không có working hour → ngoài giờ làm việc', async () => {
    setupValid();
    tx.workingHour.findFirst.mockResolvedValue(null);
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      'Ngoài giờ làm việc của stylist',
    );
  });

  it('startTime trong quá khứ', async () => {
    setupValid();
    const pastDto = { ...baseDto, startTime: '2020-01-01T10:00:00+07:00' };
    await expect(service.create(pastDto, userId)).rejects.toThrow(
      'Thời gian bắt đầu phải ở tương lai',
    );
  });

  it('trước giờ mở cửa chi nhánh', async () => {
    setupValid();
    const earlyDto = {
      ...baseDto,
      startTime: future.set({ hour: 8 }).toISO()!,
    };
    await expect(service.create(earlyDto, userId)).rejects.toThrow(
      'Ngoài giờ mở cửa của chi nhánh',
    );
  });

  it('P2002 constraint booking_no_overlap → BookingConflictException', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflicting key', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { constraint: 'booking_no_overlap' },
      }),
    );
    await expect(service.create(baseDto, userId)).rejects.toBeInstanceOf(
      BookingConflictException,
    );
  });

  it('message lỗi DB chứa 23P01 → BookingConflictException', async () => {
    prisma.$transaction.mockRejectedValue(
      new Error(
        'Database error: 23P01: conflicting key value violates exclusion constraint "booking_no_overlap"',
      ),
    );
    await expect(service.create(baseDto, userId)).rejects.toBeInstanceOf(
      BookingConflictException,
    );
  });

  it('P2002 khác (Customer_phone_key) → KHÔNG map', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { constraint: 'Customer_phone_key' },
      }),
    );
    await expect(service.create(baseDto, userId)).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});

describe('BookingService cancel/reschedule', () => {
  const tx = {
    branch: { findFirst: jest.fn() },
    service: { findFirst: jest.fn() },
    stylist: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    timeOff: { findMany: jest.fn() },
    workingHour: { findFirst: jest.fn() },
    booking: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn() as jest.Mock<unknown[], [Prisma.Sql]>,
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const slotsService = { invalidateForBooking: jest.fn() };
  const loyaltyService = { applyDiscountForNextBooking: jest.fn() };
  const remindersService = {
    scheduleForBooking: jest.fn(),
    unscheduleForBooking: jest.fn(),
  };
  const service = new BookingService(
    prisma as unknown as PrismaService,
    new TimeService(),
    new SlotEngineService(new TimeService()),
    slotsService as unknown as SlotsService,
    loyaltyService as unknown as LoyaltyService,
    remindersService as unknown as RemindersService,
  );

  beforeEach(() => jest.clearAllMocks());

  const nowVn = new TimeService().vnNow();
  const newStartVn = nowVn
    .plus({ days: 2 })
    .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  const weekday = new TimeService().vnDayOfWeek(
    newStartVn.toFormat('yyyy-MM-dd'),
  );

  const bookingRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'bk1',
    branchId: 'b1',
    serviceId: 'sv1',
    stylistId: 's1',
    customerId: 'c1',
    startTime: nowVn.plus({ hours: 30 }).toUTC().toJSDate(),
    endTime: nowVn.plus({ hours: 30, minutes: 45 }).toUTC().toJSDate(),
    status: BookingStatus.confirmed,
    ...overrides,
  });

  const setupManage = (
    booking = bookingRow(),
    user = { role: 'customer', customerId: 'c1', branchId: null },
  ) => {
    tx.booking.findUnique.mockResolvedValue(booking);
    tx.user.findUnique.mockResolvedValue(user);
  };

  const setupSlotValidation = () => {
    tx.branch.findFirst.mockResolvedValue({
      id: 'b1',
      openTime: '09:00',
      closeTime: '21:00',
    });
    tx.service.findFirst.mockResolvedValue({
      id: 'sv1',
      branchId: 'b1',
      price: 200000,
      durationMinutes: 45,
    });
    tx.stylist.findFirst.mockResolvedValue({ id: 's1', branchId: 'b1' });
    tx.timeOff.findMany.mockResolvedValue([]);
    tx.workingHour.findFirst.mockResolvedValue({
      id: 'wh1',
      dayOfWeek: weekday,
      startTime: '09:00',
      endTime: '21:00',
    });
    tx.$queryRaw.mockResolvedValue([]);
  };

  it('cancel — không phải chủ booking và không admin → 403', async () => {
    setupManage(bookingRow(), {
      role: 'customer',
      customerId: 'c9',
      branchId: null,
    });
    await expect(service.cancel('bk1', 'u1', {})).rejects.toThrow(
      'Bạn không có quyền thao tác lịch hẹn này',
    );
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('cancel — branch_admin khác branch → 403', async () => {
    setupManage(bookingRow(), {
      role: 'branch_admin',
      customerId: null,
      branchId: 'b9',
    });
    await expect(service.cancel('bk1', 'u1', {})).rejects.toThrow(
      'Bạn không có quyền thao tác lịch hẹn này',
    );
  });

  it('cancel — không tìm thấy booking → 404', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    await expect(service.cancel('bk1', 'u1', {})).rejects.toThrow(
      'Không tìm thấy lịch hẹn',
    );
  });

  it('cancel — 23h59 trước giờ hẹn, không override → 409 đúng message', async () => {
    setupManage(
      bookingRow({
        startTime: nowVn.plus({ hours: 23, minutes: 59 }).toUTC().toJSDate(),
      }),
    );
    await expect(
      service.cancel('bk1', 'u1', { reason: 'Bận' }),
    ).rejects.toThrow(
      'Không thể hủy lịch hẹn trong vòng 24 giờ trước giờ hẹn. Vui lòng liên hệ salon để được hỗ trợ.',
    );
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('cancel — >= 24h (24h + 5 phút) → cập nhật cancelled + invalidate cache', async () => {
    const startTime = nowVn.plus({ hours: 24, minutes: 5 }).toUTC().toJSDate();
    setupManage(bookingRow({ startTime }));
    tx.booking.update.mockResolvedValue({
      ...bookingRow({ startTime }),
      status: BookingStatus.cancelled,
      cancelledAt: new Date(),
      cancelReason: 'Bận việc đột xuất',
    });
    const result = await service.cancel('bk1', 'u1', {
      reason: 'Bận việc đột xuất',
    });
    expect(result.status).toBe(BookingStatus.cancelled);
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'bk1' },
      data: {
        status: BookingStatus.cancelled,
        cancelledAt: expect.any(Date) as Date,
        cancelReason: 'Bận việc đột xuất',
      },
    });
    expect(slotsService.invalidateForBooking).toHaveBeenCalledWith(
      's1',
      startTime,
    );
  });

  it('cancel — < 24h nhưng adminOverride → ok', async () => {
    setupManage(
      bookingRow({
        startTime: nowVn.plus({ hours: 20 }).toUTC().toJSDate(),
      }),
    );
    tx.booking.update.mockResolvedValue({
      ...bookingRow(),
      status: BookingStatus.cancelled,
    });
    const result = await service.cancel(
      'bk1',
      'u1',
      {},
      { adminOverride: true },
    );
    expect(result.status).toBe(BookingStatus.cancelled);
    expect(tx.booking.update).toHaveBeenCalled();
  });

  it('cancel — < 24h với role admin (không override) → ok, quy tắc chỉ áp cho khách', async () => {
    setupManage(
      bookingRow({
        startTime: nowVn.plus({ hours: 20 }).toUTC().toJSDate(),
      }),
      { role: 'super_admin', customerId: null, branchId: null },
    );
    tx.booking.update.mockResolvedValue({
      ...bookingRow(),
      status: BookingStatus.cancelled,
    });
    const result = await service.cancel('bk1', 'u1', {});
    expect(result.status).toBe(BookingStatus.cancelled);
  });

  it('cancel — booking đã cancelled → 409 "Lịch hẹn đã bị hủy"', async () => {
    setupManage(bookingRow({ status: BookingStatus.cancelled }));
    await expect(service.cancel('bk1', 'u1', {})).rejects.toThrow(
      'Lịch hẹn đã bị hủy',
    );
  });

  it('cancel — booking completed → 409 "Lịch hẹn đã ở trạng thái không thể hủy"', async () => {
    setupManage(bookingRow({ status: BookingStatus.completed }));
    await expect(service.cancel('bk1', 'u1', {})).rejects.toThrow(
      'Lịch hẹn đã ở trạng thái không thể hủy',
    );
  });

  it('reschedule — booking completed → 409 "Không thể đổi lịch ở trạng thái này"', async () => {
    setupManage(bookingRow({ status: BookingStatus.completed }));
    await expect(
      service.reschedule('bk1', 'u1', { startTime: newStartVn.toISO()! }),
    ).rejects.toThrow('Không thể đổi lịch ở trạng thái này');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('reschedule — < 24h không override → 409 (quy tắc như cancel)', async () => {
    setupManage(
      bookingRow({
        startTime: nowVn.plus({ hours: 20 }).toUTC().toJSDate(),
      }),
    );
    await expect(
      service.reschedule('bk1', 'u1', { startTime: newStartVn.toISO()! }),
    ).rejects.toThrow(
      'Không thể hủy lịch hẹn trong vòng 24 giờ trước giờ hẹn. Vui lòng liên hệ salon để được hỗ trợ.',
    );
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('reschedule — chạy lại check trùng: conflict query có row → BookingConflictException', async () => {
    setupManage();
    setupSlotValidation();
    tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
    await expect(
      service.reschedule('bk1', 'u1', { startTime: newStartVn.toISO()! }),
    ).rejects.toThrow(
      'Khung giờ này đã có lịch hẹn khác, vui lòng chọn khung giờ khác',
    );
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('reschedule — slot trống → update startTime/endTime + invalidate cache ngày cũ và ngày mới', async () => {
    const booking = bookingRow();
    setupManage(booking);
    setupSlotValidation();
    tx.booking.update.mockResolvedValue({
      ...booking,
      startTime: newStartVn.toUTC().toJSDate(),
      endTime: newStartVn.plus({ minutes: 45 }).toUTC().toJSDate(),
    });
    const result = await service.reschedule('bk1', 'u1', {
      startTime: newStartVn.toISO()!,
    });
    expect(result).toBeDefined();
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'bk1' },
      data: {
        startTime: newStartVn.toUTC().toJSDate(),
        endTime: newStartVn.plus({ minutes: 45 }).toUTC().toJSDate(),
      },
    });
    expect(slotsService.invalidateForBooking).toHaveBeenCalledTimes(2);
    expect(slotsService.invalidateForBooking).toHaveBeenCalledWith(
      's1',
      booking.startTime,
    );
    expect(slotsService.invalidateForBooking).toHaveBeenCalledWith(
      's1',
      newStartVn.toUTC().toJSDate(),
    );
  });

  it('reschedule — khách + adminOverride < 24h → ok (admin move)', async () => {
    setupManage(
      bookingRow({
        startTime: nowVn.plus({ hours: 20 }).toUTC().toJSDate(),
      }),
    );
    setupSlotValidation();
    tx.booking.update.mockResolvedValue(bookingRow());
    const result = await service.reschedule(
      'bk1',
      'u1',
      { startTime: newStartVn.toISO()! },
      { adminOverride: true },
    );
    expect(result).toBeDefined();
    expect(tx.booking.update).toHaveBeenCalled();
  });

  it('reschedule — startTime sai format → 400', async () => {
    setupManage();
    await expect(
      service.reschedule('bk1', 'u1', { startTime: 'khong-phai-iso' }),
    ).rejects.toThrow('Thời gian bắt đầu không hợp lệ');
  });
});
