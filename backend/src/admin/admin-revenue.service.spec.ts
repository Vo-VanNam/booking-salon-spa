import { DateTime } from 'luxon';
import {
  AdminRevenueService,
  RevenueBookingInput,
} from './admin-revenue.service';
import { VN_TIMEZONE } from '../time/time.service';

const service = new AdminRevenueService();

// Ngày giờ VN tương đối với hôm nay để test không lệ thuộc ngày chạy.
function at(dayOffset: number, hour = 10): Date {
  return DateTime.now()
    .setZone(VN_TIMEZONE)
    .plus({ days: dayOffset })
    .set({ hour, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

function booking(
  overrides: Partial<RevenueBookingInput> = {},
): RevenueBookingInput {
  return {
    id: 'b1',
    startTime: at(0),
    status: 'completed',
    priceAtBooking: 150000,
    discountAmount: 0,
    depositAmount: 0,
    depositStatus: 'none',
    ...overrides,
  };
}

describe('AdminRevenueService', () => {
  it('(a) completed + cọc đã thu: depositCollected + counterPaid đúng số', () => {
    const { rows, summary } = service.calculate(
      [
        booking({
          id: 'b1',
          status: 'completed',
          priceAtBooking: 150000,
          depositAmount: 50000,
          depositStatus: 'paid',
        }),
      ],
      'day',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      depositCollected: 50000,
      counterPaid: 100000,
      total: 150000,
      bookingCount: 1,
      completedCount: 1,
      cancelledCount: 0,
    });
    expect(summary.total).toBe(150000);
  });

  it('(b) booking cancelled: không vào bookingCount, vào cancelledCount, không có counterPaid', () => {
    const { rows, summary } = service.calculate(
      [
        booking({ id: 'b1', status: 'cancelled', priceAtBooking: 150000 }),
        booking({ id: 'b2', status: 'completed', priceAtBooking: 100000 }),
      ],
      'day',
    );
    expect(rows[0]).toMatchObject({
      depositCollected: 0,
      counterPaid: 100000,
      bookingCount: 1,
      completedCount: 1,
      cancelledCount: 1,
    });
    expect(summary.bookingCount).toBe(1);
    expect(summary.cancelledCount).toBe(1);
  });

  it('(c) groupBy month: gộp đúng period yyyy-MM, tách khác tháng', () => {
    const monthA1 = DateTime.now().setZone(VN_TIMEZONE).startOf('month');
    const monthB = monthA1.minus({ months: 1 });
    const { rows, summary } = service.calculate(
      [
        booking({
          id: 'b1',
          startTime: monthA1.plus({ days: 1 }).set({ hour: 9 }).toJSDate(),
          priceAtBooking: 100000,
        }),
        booking({
          id: 'b2',
          startTime: monthA1.plus({ days: 20 }).set({ hour: 14 }).toJSDate(),
          priceAtBooking: 200000,
        }),
        booking({
          id: 'b3',
          startTime: monthB.plus({ days: 5 }).set({ hour: 10 }).toJSDate(),
          priceAtBooking: 300000,
        }),
      ],
      'month',
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.period)).toEqual([
      monthB.toFormat('yyyy-MM'),
      monthA1.toFormat('yyyy-MM'),
    ]);
    expect(rows[1].counterPaid).toBe(300000);
    expect(rows[1].bookingCount).toBe(2);
    expect(summary.counterPaid).toBe(600000);
    expect(summary.bookingCount).toBe(3);
  });

  it('(d) completed có discountAmount: counterPaid trừ đúng', () => {
    const { rows } = service.calculate(
      [
        booking({
          priceAtBooking: 200000,
          discountAmount: 20000,
          depositStatus: 'paid',
          depositAmount: 50000,
        }),
      ],
      'day',
    );
    expect(rows[0].counterPaid).toBe(130000);
    expect(rows[0].total).toBe(180000);
  });

  it('(e) counterPaid âm (giảm giá vượt giá trị) → tính 0', () => {
    const { rows } = service.calculate(
      [
        booking({
          priceAtBooking: 100000,
          discountAmount: 150000,
          depositAmount: 0,
        }),
      ],
      'day',
    );
    expect(rows[0].counterPaid).toBe(0);
    expect(rows[0].total).toBe(0);
  });

  it('không tính no_show vào bookingCount', () => {
    const { summary } = service.calculate(
      [
        booking({ id: 'b1', status: 'no_show' }),
        booking({ id: 'b2', status: 'confirmed' }),
      ],
      'day',
    );
    expect(summary.bookingCount).toBe(1);
    expect(summary.completedCount).toBe(0);
  });
});
