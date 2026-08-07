import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';

export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

const DATE_FORMAT = 'yyyy-MM-dd';
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

@Injectable()
export class TimeService {
  vnNow(): DateTime {
    return DateTime.now().setZone(VN_TIMEZONE);
  }

  parseVnDate(dateStr: string): DateTime {
    const dt = DateTime.fromFormat(dateStr, DATE_FORMAT, { zone: VN_TIMEZONE });
    if (!dt.isValid || dt.toFormat(DATE_FORMAT) !== dateStr) {
      throw new BusinessRuleException('Ngày không hợp lệ');
    }
    return dt;
  }

  dateToVnRange(dateStr: string): { startUtc: Date; endUtc: Date } {
    const start = this.parseVnDate(dateStr);
    return {
      startUtc: start.toUTC().toJSDate(),
      endUtc: start.plus({ days: 1 }).toUTC().toJSDate(),
    };
  }

  vnDayOfWeek(dateStr: string): number {
    const dt = this.parseVnDate(dateStr);
    return dt.weekday % 7; // ISO 1=Thứ 2..7=Chủ nhật → VN 0=Chủ nhật..6=Thứ 7
  }

  hhmmToVnDate(dateStr: string, hhmm: string): Date {
    if (!HHMM_REGEX.test(hhmm)) {
      throw new BusinessRuleException('Giờ không hợp lệ');
    }
    const [hour, minute] = hhmm.split(':').map(Number);
    return this.parseVnDate(dateStr)
      .set({ hour, minute, second: 0, millisecond: 0 })
      .toUTC()
      .toJSDate();
  }

  overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return !(aEnd <= bStart || aStart >= bEnd);
  }

  formatVnDateTime(d: Date): string {
    return DateTime.fromJSDate(d)
      .setZone(VN_TIMEZONE)
      .toFormat('dd/MM/yyyy HH:mm');
  }

  formatVnHm(d: Date): string {
    return DateTime.fromJSDate(d).setZone(VN_TIMEZONE).toFormat('HH:mm');
  }

  isAtLeast24hBefore(start: Date, now: Date): boolean {
    return now.getTime() <= start.getTime() - 24 * 60 * 60 * 1000;
  }
}
