import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService, VN_TIMEZONE } from '../time/time.service';
import { DayContext, SlotEngineService } from './slot-engine.service';
import { SlotCacheService } from './slot-cache.service';

export interface SlotResult {
  date: string;
  slots: string[];
  timezone: string;
  reason?: string;
}

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SlotCacheService,
    private readonly engine: SlotEngineService,
    private readonly time: TimeService,
  ) {}

  // Cache-first: có context thì dựng slot từ cache, không query DB gì cả.
  // Chỉ khi miss mới validate + query DB (cache key gắn branch+stylist+date
  // nên không sợ phục vụ sai dữ liệu cho người hỏi khác).
  async getSlots(
    branchId: string,
    stylistId: string,
    dateStr: string,
    durationMinutes: number,
  ): Promise<SlotResult> {
    const cached = await this.cache.getContext(branchId, stylistId, dateStr);
    if (cached) {
      return this.buildResult(
        dateStr,
        this.engine.buildSlots(cached, durationMinutes),
      );
    }

    const [branch, stylist] = await Promise.all([
      this.prisma.branch.findFirst({
        where: { id: branchId, active: true },
        select: { id: true, openTime: true, closeTime: true },
      }),
      this.prisma.stylist.findFirst({
        where: { id: stylistId, active: true },
        select: { id: true, branchId: true },
      }),
    ]);
    if (!branch) {
      throw new BusinessRuleException(
        'Không tìm thấy chi nhánh',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!stylist) {
      throw new BusinessRuleException(
        'Không tìm thấy stylist',
        HttpStatus.NOT_FOUND,
      );
    }
    if (stylist.branchId !== branchId) {
      throw new BusinessRuleException(
        'Stylist không thuộc chi nhánh này',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { startUtc, endUtc } = this.time.dateToVnRange(dateStr);
    const weekday = this.time.vnDayOfWeek(dateStr);
    const [workingHours, timeOffs, bookings] = await Promise.all([
      this.prisma.workingHour.findMany({
        where: { stylistId, dayOfWeek: weekday },
        select: { dayOfWeek: true, startTime: true, endTime: true },
      }),
      this.prisma.timeOff.findMany({
        where: {
          stylistId,
          startTime: { lt: endUtc },
          endTime: { gt: startUtc },
        },
        select: { startTime: true, endTime: true },
      }),
      this.prisma.booking.findMany({
        where: {
          stylistId,
          status: { in: [BookingStatus.pending, BookingStatus.confirmed] },
          startTime: { lt: endUtc },
          endTime: { gt: startUtc },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    let context: DayContext;
    try {
      context = this.engine.computeDayContext({
        dateStr,
        workingHours,
        branchOpen: branch.openTime,
        branchClose: branch.closeTime,
        timeOffs: timeOffs.map((t) => ({ start: t.startTime, end: t.endTime })),
        bookings: bookings.map((b) => ({ start: b.startTime, end: b.endTime })),
      });
    } catch (error) {
      // Stylist nghỉ / ngoài giờ là trạng thái bình thường với UX wizard:
      // trả 200 kèm reason để hiển thị "không có slot" thay vì lỗi.
      if (
        error instanceof BusinessRuleException &&
        (error.message === 'Stylist không làm việc vào ngày này' ||
          error.message === 'Ngoài giờ làm việc')
      ) {
        return this.buildResult(dateStr, [], error.message);
      }
      throw error;
    }

    await this.cache.setContext(branchId, stylistId, dateStr, context);
    return this.buildResult(
      dateStr,
      this.engine.buildSlots(context, durationMinutes),
    );
  }

  // Task 6 gọi sau khi tạo booking: tính ngày VN từ startTime rồi xóa cache slot
  async invalidateForBooking(
    stylistId: string,
    startTime: Date,
  ): Promise<void> {
    const dateStr = DateTime.fromJSDate(startTime)
      .setZone(VN_TIMEZONE)
      .toFormat('yyyy-MM-dd');
    await this.cache.invalidate(stylistId, dateStr);
  }

  private buildResult(
    date: string,
    slots: string[],
    reason?: string,
  ): SlotResult {
    return reason
      ? { date, slots, timezone: VN_TIMEZONE, reason }
      : { date, slots, timezone: VN_TIMEZONE };
  }
}
