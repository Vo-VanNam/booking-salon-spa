import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { BookingStatus, LoyaltyType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService, VN_TIMEZONE } from '../time/time.service';
import { LOYALTY_CRON_JOB, LOYALTY_QUEUE } from './loyalty.types';

const COMPLETED_REWARD_POINTS = 10;
const REWARD_THRESHOLD_POINTS = 100;
const DISCOUNT_RATE = 0.1;
const EARN_REASON = 'Hoàn thành lịch hẹn';
const SPEND_REASON = 'Áp dụng giảm giá 10% cho lịch hẹn kế tiếp';

@Injectable()
export class LoyaltyService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    @InjectQueue(LOYALTY_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Không đăng ký repeatable job khi test để tránh trùng lịch giữa các lần chạy.
    if (process.env.NODE_ENV === 'test') return;
    await this.queue.add(
      LOYALTY_CRON_JOB,
      {},
      {
        repeat: { pattern: '30 0 * * *', tz: VN_TIMEZONE },
        jobId: 'loyalty-cron',
      },
    );
  }

  // Chạy trong transaction khi booking chuyển sang completed. Idempotent theo
  // (bookingId, type=earn) — chạy lại lần 2 trả false và không cộng điểm kép.
  async applyCompletedReward(
    tx: Prisma.TransactionClient,
    booking: { id: string; customerId: string },
  ): Promise<boolean> {
    const existing = await tx.loyaltyTransaction.findFirst({
      where: { bookingId: booking.id, type: LoyaltyType.earn },
    });
    if (existing) return false;

    await tx.customer.update({
      where: { id: booking.customerId },
      data: {
        completedCount: { increment: 1 },
        loyaltyPoints: { increment: COMPLETED_REWARD_POINTS },
      },
    });
    await tx.loyaltyTransaction.create({
      data: {
        customerId: booking.customerId,
        bookingId: booking.id,
        points: COMPLETED_REWARD_POINTS,
        type: LoyaltyType.earn,
        reason: EARN_REASON,
        actorType: 'system',
        actorId: null,
      },
    });
    return true;
  }

  // Đủ 100 điểm → giảm 10% (làm tròn) cho booking kế tiếp; trả discountAmount.
  async applyDiscountForNextBooking(
    tx: Prisma.TransactionClient,
    customer: { id: string; loyaltyPoints: number },
    priceAtBooking: number,
  ): Promise<number> {
    if (customer.loyaltyPoints < REWARD_THRESHOLD_POINTS) return 0;

    const discountAmount = Math.round(priceAtBooking * DISCOUNT_RATE);
    await tx.customer.update({
      where: { id: customer.id },
      data: { loyaltyPoints: { decrement: REWARD_THRESHOLD_POINTS } },
    });
    await tx.loyaltyTransaction.create({
      data: {
        customerId: customer.id,
        points: -REWARD_THRESHOLD_POINTS,
        type: LoyaltyType.spend,
        reason: SPEND_REASON,
        actorType: 'system',
        actorId: null,
      },
    });
    return discountAmount;
  }

  async countCompletedBookings(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<number> {
    return tx.booking.count({
      where: { customerId, status: BookingStatus.completed },
    });
  }

  // Cron: đánh dấu completed các booking confirmed đã kết thúc + cộng điểm.
  async completeOverdueBookings(): Promise<{
    processed: number;
    rewarded: number;
  }> {
    const now = this.time.vnNow().toUTC().toJSDate();
    const overdue = await this.prisma.booking.findMany({
      where: { status: BookingStatus.confirmed, endTime: { lt: now } },
      select: { id: true, customerId: true },
    });

    let rewarded = 0;
    for (const booking of overdue) {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.completed },
        });
        if (await this.applyCompletedReward(tx, booking)) rewarded++;
      });
    }
    return { processed: overdue.length, rewarded };
  }
}
