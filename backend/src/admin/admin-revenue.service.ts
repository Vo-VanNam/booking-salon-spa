import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { VN_TIMEZONE } from '../time/time.service';

// Input tối thiểu cần thiết để tính doanh thu (lấy thẳng từ select Prisma).
export interface RevenueBookingInput {
  id: string;
  startTime: Date;
  status: string;
  priceAtBooking: number;
  discountAmount: number;
  depositAmount: number;
  depositStatus: string;
}

export interface RevenueRow {
  period: string;
  depositCollected: number;
  counterPaid: number;
  total: number;
  bookingCount: number;
  completedCount: number;
  cancelledCount: number;
}

export type RevenueGroupBy = 'day' | 'month';

const EMPTY_ROW = (period: string): RevenueRow => ({
  period,
  depositCollected: 0,
  counterPaid: 0,
  total: 0,
  bookingCount: 0,
  completedCount: 0,
  cancelledCount: 0,
});

@Injectable()
export class AdminRevenueService {
  // Công thức doanh thu theo kỳ (ngày/tháng theo giờ VN):
  // - depositCollected: tổng tiền cọc đã thu (depositStatus = paid), mọi trạng thái booking.
  // - counterPaid: tổng (priceAtBooking − discountAmount − depositAmount) của booking
  //   completed (thanh toán tại quầy); nếu âm thì tính 0.
  // - total = depositCollected + counterPaid.
  // - bookingCount: tổng booking không tính cancelled/no_show.
  calculate(
    bookings: RevenueBookingInput[],
    groupBy: RevenueGroupBy,
  ): { rows: RevenueRow[]; summary: RevenueRow } {
    const periodFormat = groupBy === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd';
    const byPeriod = new Map<string, RevenueRow>();

    for (const b of bookings) {
      const period = DateTime.fromJSDate(b.startTime)
        .setZone(VN_TIMEZONE)
        .toFormat(periodFormat);
      let row = byPeriod.get(period);
      if (!row) {
        row = EMPTY_ROW(period);
        byPeriod.set(period, row);
      }
      if (b.depositStatus === 'paid') {
        row.depositCollected += b.depositAmount;
      }
      if (b.status === 'completed') {
        row.counterPaid += Math.max(
          0,
          b.priceAtBooking - b.discountAmount - b.depositAmount,
        );
        row.completedCount += 1;
      }
      if (b.status === 'cancelled') {
        row.cancelledCount += 1;
      }
      if (b.status !== 'cancelled' && b.status !== 'no_show') {
        row.bookingCount += 1;
      }
      row.total = row.depositCollected + row.counterPaid;
    }

    const rows = [...byPeriod.values()].sort((a, b) =>
      a.period.localeCompare(b.period),
    );
    const summary: RevenueRow = rows.reduce((acc, row) => {
      acc.depositCollected += row.depositCollected;
      acc.counterPaid += row.counterPaid;
      acc.total += row.total;
      acc.bookingCount += row.bookingCount;
      acc.completedCount += row.completedCount;
      acc.cancelledCount += row.cancelledCount;
      return acc;
    }, EMPTY_ROW('Tổng'));
    return { rows, summary };
  }
}
