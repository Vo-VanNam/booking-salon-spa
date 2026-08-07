import { SlotEngineService, DayContextInput } from './slot-engine.service';
import { TimeService } from '../time/time.service';

describe('SlotEngineService', () => {
  const time = new TimeService();
  const engine = new SlotEngineService(time);
  const at = (h: number, m = 0): Date =>
    new Date(Date.UTC(2026, 7, 7, h - 7, m)); // giờ VN (UTC+7) → UTC

  const base: DayContextInput = {
    dateStr: '2026-08-07', // thứ 6 → dayOfWeek 5
    workingHours: [{ dayOfWeek: 5, startTime: '09:00', endTime: '21:00' }],
    branchOpen: '09:00',
    branchClose: '21:00',
    timeOffs: [],
    bookings: [],
  };

  it('working 09:00-21:00, duration 30 → slot 09:00..20:30, kết thúc đúng hết giờ hợp lệ', () => {
    const ctx = engine.computeDayContext(base);
    expect(ctx.workingStart.toISOString()).toBe('2026-08-07T02:00:00.000Z');
    expect(ctx.workingEnd.toISOString()).toBe('2026-08-07T14:00:00.000Z');
    const slots = engine.buildSlots(ctx, 30);
    expect(slots[0]).toBe('09:00');
    expect(slots[slots.length - 1]).toBe('20:30');
    expect(slots).toContain('20:30'); // 20:30+30 = 21:00 → hợp lệ
    expect(slots).not.toContain('20:45'); // 20:45+30 = 21:15 > 21:00 → loại
    expect(slots).toHaveLength(47);
  });

  it('booking 14:00-15:00 chặn mọi slot cắt khoảng đó, 15:00 vẫn còn', () => {
    const ctx = engine.computeDayContext({
      ...base,
      bookings: [{ start: at(14), end: at(15) }],
    });
    const slots = engine.buildSlots(ctx, 30);
    expect(slots).not.toContain('13:45');
    expect(slots).not.toContain('14:00');
    expect(slots).not.toContain('14:30');
    expect(slots).not.toContain('14:45');
    expect(slots).toContain('15:00');
    expect(slots).toContain('13:30');
    expect(slots).toHaveLength(42);
  });

  it('time_off trùng một phần giờ làm → bị trừ đúng', () => {
    const ctx = engine.computeDayContext({
      ...base,
      timeOffs: [{ start: at(12), end: at(13, 30) }],
    });
    const slots = engine.buildSlots(ctx, 30);
    expect(slots).not.toContain('12:00');
    expect(slots).not.toContain('13:15');
    expect(slots).toContain('13:30');
    expect(slots).toHaveLength(40);
  });

  it('không có working hour cho weekday → throw', () => {
    expect(() =>
      engine.computeDayContext({ ...base, workingHours: [] }),
    ).toThrow('Stylist không làm việc vào ngày này');
  });

  it('branch 10:00-22:00 vs stylist 09:00-21:00 → window 10:00-21:00', () => {
    const ctx = engine.computeDayContext({
      ...base,
      branchOpen: '10:00',
      branchClose: '22:00',
    });
    expect(ctx.workingStart.toISOString()).toBe('2026-08-07T03:00:00.000Z');
    expect(ctx.workingEnd.toISOString()).toBe('2026-08-07T14:00:00.000Z');
    const slots = engine.buildSlots(ctx, 30);
    expect(slots[0]).toBe('10:00');
    expect(slots[slots.length - 1]).toBe('20:30');
    expect(slots).not.toContain('09:00');
    expect(slots).not.toContain('20:45');
  });

  it('step 15 → bước đúng 15 phút và đủ số lượng', () => {
    const ctx = engine.computeDayContext(base);
    const slots = engine.buildSlots(ctx, 30, 15);
    expect(slots).toHaveLength(47);
    for (let i = 1; i < slots.length; i++) {
      const [ph, pm] = slots[i - 1].split(':').map(Number);
      const [h, m] = slots[i].split(':').map(Number);
      expect(h * 60 + m - (ph * 60 + pm)).toBe(15);
    }
  });

  it('window không cắt nhau → throw "Ngoài giờ làm việc"', () => {
    expect(() =>
      engine.computeDayContext({
        ...base,
        branchOpen: '22:00',
        branchClose: '23:00',
      }),
    ).toThrow('Ngoài giờ làm việc');
  });

  it('busy trải cả ngày → clip về [dayStart, dayEnd) → không còn slot nào', () => {
    const ctx = engine.computeDayContext({
      ...base,
      bookings: [
        {
          start: new Date('2026-08-06T18:00:00Z'),
          end: new Date('2026-08-08T18:00:00Z'),
        },
      ],
    });
    expect(engine.buildSlots(ctx, 30)).toHaveLength(0);
  });
});
