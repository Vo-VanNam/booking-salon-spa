import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppLogger } from '../common/logger';
import { loyaltyConfig } from '../common/config';
import { roundVnd } from '../common/validators';
import { PrismaService } from '../prisma/prisma.module';

export interface LoyaltyCustomer {
  id: string;
  completedBookings: number;
  loyaltyDiscountUsedAt: number | null;
}

type TxClient = Prisma.TransactionClient | PrismaService;

/**
 * Loyalty (DOCUMENT.md §2.4): khách hoàn thành đủ ngưỡng (mặc định 10 lần) được giảm giá cho
 * lần đặt kế tiếp. Mọi lần cộng/trừ đều ghi LoyaltyTransaction để audit.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new AppLogger('loyalty');

  constructor(private readonly prisma: PrismaService) {}

  /** Số tiền giảm cho booking mới; 0 nếu chưa đạt ngưỡng hoặc ưu đãi của chu kỳ đã dùng. */
  computeDiscount(customer: LoyaltyCustomer, price: number): number {
    const { threshold, discountPercent } = loyaltyConfig();
    if (threshold <= 0 || discountPercent <= 0) return 0;
    if (customer.completedBookings < threshold) return 0;
    if (customer.completedBookings % threshold !== 0) return 0;
    if (customer.loyaltyDiscountUsedAt === customer.completedBookings) return 0;
    return Math.min(roundVnd((price * discountPercent) / 100), price);
  }

  /** Đánh dấu ưu đãi của chu kỳ đã dùng — chống dùng lại nhiều lần. */
  async markDiscountUsed(tx: TxClient, customerId: string, completedBookings: number): Promise<void> {
    await tx.customer.update({
      where: { id: customerId },
      data: { loyaltyDiscountUsedAt: completedBookings },
    });
  }

  async recordRedeem(
    tx: TxClient,
    params: { customerId: string; bookingId: string; discountAmount: number; actor?: string },
  ): Promise<void> {
    await tx.loyaltyTransaction.create({
      data: {
        customerId: params.customerId,
        bookingId: params.bookingId,
        type: 'redeem',
        points: 0,
        discountAmount: params.discountAmount,
        description: `Giảm giá loyalty cho lần đặt kế tiếp (${params.discountAmount} VND)`,
        actor: params.actor ?? 'system',
      },
    });
  }

  async recordEarn(tx: TxClient, params: { customerId: string; bookingId: string; actor?: string }): Promise<void> {
    await tx.loyaltyTransaction.create({
      data: {
        customerId: params.customerId,
        bookingId: params.bookingId,
        type: 'earn',
        points: 1,
        discountAmount: 0,
        description: 'Hoàn thành 1 lịch hẹn — cộng 1 lần tích luỹ',
        actor: params.actor ?? 'system',
      },
    });
  }

  async history(customerId: string, limit = 50) {
    const items = await this.prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.map((item) => ({
      id: item.id,
      booking_id: item.bookingId,
      type: item.type,
      points: item.points,
      discount_amount: item.discountAmount,
      description: item.description,
      actor: item.actor,
      created_at: item.createdAt.toISOString(),
    }));
  }

  /**
   * Cron đối soát: tính lại số lần hoàn thành từ dữ liệu booking (nguồn sự thật) và ghi log
   * điều chỉnh khi phát hiện lệch.
   */
  async reconcileCompletedCounts(): Promise<{ checked: number; adjusted: number }> {
    const customers = await this.prisma.customer.findMany({ select: { id: true, completedBookings: true } });
    let adjusted = 0;
    for (const customer of customers) {
      const completed = await this.prisma.booking.count({ where: { customerId: customer.id, status: 'completed' } });
      if (completed !== customer.completedBookings) {
        await this.prisma.$transaction(async (tx) => {
          await tx.customer.update({ where: { id: customer.id }, data: { completedBookings: completed } });
          await tx.loyaltyTransaction.create({
            data: {
              customerId: customer.id,
              type: 'adjust',
              points: completed - customer.completedBookings,
              description: `Đối soát tự động: ${customer.completedBookings} → ${completed} lần hoàn thành`,
              actor: 'cron',
            },
          });
        });
        adjusted += 1;
      }
    }
    this.logger.log('Đối soát loyalty hoàn tất', { checked: customers.length, adjusted });
    return { checked: customers.length, adjusted };
  }
}
