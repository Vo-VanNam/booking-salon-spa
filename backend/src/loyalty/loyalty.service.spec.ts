import { BookingStatus, LoyaltyType } from '@prisma/client';
import { Queue } from 'bullmq';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';

describe('LoyaltyService', () => {
  const tx = {
    loyaltyTransaction: { findFirst: jest.fn(), create: jest.fn() },
    customer: { update: jest.fn() },
    booking: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
  };
  const prisma = {
    booking: {
      findMany: jest.fn() as jest.Mock<
        Promise<{ id: string; customerId: string }[]>,
        [
          {
            where: {
              status: BookingStatus;
              endTime: { lt: Date };
            };
            select: Record<string, boolean>;
          },
        ]
      >,
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const queue = { add: jest.fn() };
  const service = new LoyaltyService(
    prisma as unknown as PrismaService,
    new TimeService(),
    queue as unknown as Queue,
  );

  beforeEach(() => jest.clearAllMocks());

  it('completed lần đầu → +10 điểm, completedCount +1, tạo tx earn', async () => {
    tx.loyaltyTransaction.findFirst.mockResolvedValue(null);
    const result = await service.applyCompletedReward(tx, {
      id: 'bk1',
      customerId: 'c1',
    });

    expect(result).toBe(true);
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        completedCount: { increment: 1 },
        loyaltyPoints: { increment: 10 },
      },
    });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        customerId: 'c1',
        bookingId: 'bk1',
        points: 10,
        type: LoyaltyType.earn,
        reason: 'Hoàn thành lịch hẹn',
        actorType: 'system',
        actorId: null,
      },
    });
  });

  it('completed lần 2 cùng booking → bỏ qua (idempotent), không cộng điểm', async () => {
    tx.loyaltyTransaction.findFirst.mockResolvedValue({ id: 'lt1' });
    const result = await service.applyCompletedReward(tx, {
      id: 'bk1',
      customerId: 'c1',
    });

    expect(result).toBe(false);
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it('loyaltyPoints >= 100 → discount 10% làm tròn, tx spend -100, trừ điểm', async () => {
    const discount = await service.applyDiscountForNextBooking(
      tx,
      { id: 'c1', loyaltyPoints: 100 },
      200000,
    );

    expect(discount).toBe(20000);
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { loyaltyPoints: { decrement: 100 } },
    });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        customerId: 'c1',
        points: -100,
        type: LoyaltyType.spend,
        reason: 'Áp dụng giảm giá 10% cho lịch hẹn kế tiếp',
        actorType: 'system',
        actorId: null,
      },
    });
  });

  it('loyaltyPoints < 100 → discount 0, không ghi gì', async () => {
    const discount = await service.applyDiscountForNextBooking(
      tx,
      { id: 'c1', loyaltyPoints: 99 },
      200000,
    );

    expect(discount).toBe(0);
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it('countCompletedBookings đếm booking completed của khách', async () => {
    tx.booking.count.mockResolvedValue(3);
    const count = await service.countCompletedBookings(tx, 'c1');

    expect(count).toBe(3);
    expect(tx.booking.count).toHaveBeenCalledWith({
      where: { customerId: 'c1', status: BookingStatus.completed },
    });
  });

  it('completeOverdueBookings chỉ xử lý booking confirmed quá hạn, chạy lại → processed 0', async () => {
    tx.booking.findMany.mockResolvedValueOnce([
      { id: 'bk1', customerId: 'c1' },
    ]);
    prisma.booking.findMany.mockResolvedValueOnce([
      { id: 'bk1', customerId: 'c1' },
    ]);
    tx.loyaltyTransaction.findFirst.mockResolvedValue(null);

    const first = await service.completeOverdueBookings();
    const queryArg = prisma.booking.findMany.mock.calls[0][0];
    expect(queryArg.where.status).toBe(BookingStatus.confirmed);
    expect(queryArg.where.endTime.lt).toBeInstanceOf(Date);
    expect(queryArg.select).toEqual({ id: true, customerId: true });
    expect(first).toEqual({ processed: 1, rewarded: 1 });
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'bk1' },
      data: { status: BookingStatus.completed },
    });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalled();

    prisma.booking.findMany.mockResolvedValueOnce([]);
    const second = await service.completeOverdueBookings();
    expect(second).toEqual({ processed: 0, rewarded: 0 });
  });
});
