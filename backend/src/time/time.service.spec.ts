import { TimeService } from './time.service';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';

describe('TimeService', () => {
  const service = new TimeService();
  const at = (h: number, m = 0): Date => new Date(Date.UTC(2026, 7, 7, h, m));

  describe('parseVnDate', () => {
    it('trả về DateTime hợp lệ trong zone VN', () => {
      const dt = service.parseVnDate('2026-08-07');
      expect(dt.isValid).toBe(true);
      expect(dt.zoneName).toBe('Asia/Ho_Chi_Minh');
      expect(dt.toFormat('yyyy-MM-dd')).toBe('2026-08-07');
    });

    const invalidDates: string[] = [
      '07/08/2026',
      '2026-8-7',
      '2026-02-30',
      'abc',
    ];
    it.each(invalidDates)('throw BusinessRuleException cho "%s"', (input) => {
      expect(() => service.parseVnDate(input)).toThrow(BusinessRuleException);
    });
  });

  describe('dateToVnRange', () => {
    it('nửa mở [00:00 VN, 00:00 VN hôm sau) → UTC', () => {
      const { startUtc, endUtc } = service.dateToVnRange('2026-08-07');
      expect(startUtc.toISOString()).toBe('2026-08-06T17:00:00.000Z');
      expect(endUtc.toISOString()).toBe('2026-08-07T17:00:00.000Z');
    });
  });

  describe('vnDayOfWeek', () => {
    it('2026-08-07 là thứ 6 → 5', () => {
      expect(service.vnDayOfWeek('2026-08-07')).toBe(5);
    });
    it('2026-08-09 là chủ nhật → 0', () => {
      expect(service.vnDayOfWeek('2026-08-09')).toBe(0);
    });
    it('2026-08-10 là thứ 2 → 1', () => {
      expect(service.vnDayOfWeek('2026-08-10')).toBe(1);
    });
  });

  describe('hhmmToVnDate', () => {
    it('09:30 VN → 02:30 UTC', () => {
      expect(service.hhmmToVnDate('2026-08-07', '09:30').toISOString()).toBe(
        '2026-08-07T02:30:00.000Z',
      );
    });
    it('throw cho giờ sai format', () => {
      expect(() => service.hhmmToVnDate('2026-08-07', '25:00')).toThrow(
        BusinessRuleException,
      );
    });
  });

  describe('overlaps', () => {
    it('chạm biên → false (phạm vi nửa mở)', () => {
      expect(service.overlaps(at(10), at(11), at(11), at(12))).toBe(false);
      expect(service.overlaps(at(10), at(11), at(12), at(13))).toBe(false);
    });
    it('cắt nhau → true', () => {
      expect(service.overlaps(at(10), at(11), at(10, 30), at(11, 30))).toBe(
        true,
      );
    });
    it('nằm trong → true', () => {
      expect(service.overlaps(at(10), at(11), at(10, 30), at(10, 45))).toBe(
        true,
      );
    });
  });

  describe('formatVnDateTime', () => {
    it('dd/MM/yyyy HH:mm theo giờ VN', () => {
      expect(service.formatVnDateTime(new Date('2026-08-07T02:30:00Z'))).toBe(
        '07/08/2026 09:30',
      );
    });
  });

  describe('isAtLeast24hBefore', () => {
    const start = at(10);
    it('đúng 24h00 → true', () => {
      expect(
        service.isAtLeast24hBefore(start, new Date(Date.UTC(2026, 7, 6, 10))),
      ).toBe(true);
    });
    it('23h59 → false', () => {
      expect(
        service.isAtLeast24hBefore(
          start,
          new Date(Date.UTC(2026, 7, 6, 10, 1)),
        ),
      ).toBe(false);
    });
  });
});
