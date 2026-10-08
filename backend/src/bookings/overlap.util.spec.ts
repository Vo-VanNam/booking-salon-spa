import { buildStarts, findOverlap, isCoveredByRanges, minutesOverlap, rangesOverlap } from './overlap.util';

/**
 * Unit test cho logic check trùng lịch (DOCUMENT.md §4.1, §8) — thuần logic, không cần DB.
 * Điều kiện chuẩn: NOT (a.end <= b.start OR a.start >= b.end).
 */
describe('rangesOverlap (điều kiện NOT (end <= start OR start >= end))', () => {
  const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 8, hour, minute));

  it('hai khung giờ chồng lấn một phần → true', () => {
    expect(rangesOverlap(at(9), at(10), at(9, 30), at(10, 30))).toBe(true);
    expect(rangesOverlap(at(9, 30), at(10, 30), at(9), at(10))).toBe(true);
  });

  it('khung giờ nằm trong khung khác → true', () => {
    expect(rangesOverlap(at(9), at(12), at(10), at(11))).toBe(true);
    expect(rangesOverlap(at(10), at(11), at(9), at(12))).toBe(true);
  });

  it('trùng khít → true', () => {
    expect(rangesOverlap(at(9), at(10), at(9), at(10))).toBe(true);
  });

  it('chạm biên (kết thúc đúng lúc bắt đầu) → false', () => {
    expect(rangesOverlap(at(9), at(10), at(10), at(11))).toBe(false);
    expect(rangesOverlap(at(10), at(11), at(9), at(10))).toBe(false);
  });

  it('rời hẳn nhau → false', () => {
    expect(rangesOverlap(at(9), at(10), at(14), at(15))).toBe(false);
  });

  it('khung dài 45 phút so với booking 08:00–08:45: 08:30 chồng lấn, 08:45 không', () => {
    const existing = { start: at(8), end: at(8, 45) };
    expect(findOverlap({ start: at(8, 30), end: at(9, 15) }, [existing])).toBeDefined();
    expect(findOverlap({ start: at(8, 45), end: at(9, 15) }, [existing])).toBeUndefined();
  });
});

describe('findOverlap', () => {
  it('bỏ qua các booking đã hủy khi caller đã lọc (hàm thuần chỉ nhận danh sách còn hiệu lực)', () => {
    const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 8, hour, minute));
    const busy = [{ start: at(9), end: at(10) }];
    expect(findOverlap({ start: at(10), end: at(11) }, busy)).toBeUndefined();
    expect(findOverlap({ start: at(9, 59), end: at(11) }, busy)).toBeDefined();
  });
});

describe('isCoveredByRanges / minutesOverlap / buildStarts', () => {
  it('khung phải nằm trọn trong một khoảng làm việc', () => {
    const ranges = [{ startMin: 480, endMin: 1200 }];
    expect(isCoveredByRanges(540, 600, ranges)).toBe(true);
    expect(isCoveredByRanges(480, 1200, ranges)).toBe(true);
    expect(isCoveredByRanges(470, 600, ranges)).toBe(false);
    expect(isCoveredByRanges(1140, 1260, ranges)).toBe(false);
  });

  it('không nối hai khoảng rời nhau', () => {
    const ranges = [
      { startMin: 480, endMin: 660 },
      { startMin: 720, endMin: 1200 },
    ];
    expect(isCoveredByRanges(630, 750, ranges)).toBe(false);
  });

  it('minutesOverlap tôn trọng biên', () => {
    expect(minutesOverlap({ startMin: 480, endMin: 540 }, { startMin: 540, endMin: 600 })).toBe(false);
    expect(minutesOverlap({ startMin: 480, endMin: 541 }, { startMin: 540, endMin: 600 })).toBe(true);
  });

  it('buildStarts sinh mốc bắt đầu sao cho kết thúc không vượt khung', () => {
    expect(buildStarts({ startMin: 480, endMin: 600 }, 60, 30)).toEqual([480, 510, 540]);
    expect(buildStarts({ startMin: 480, endMin: 500 }, 60, 15)).toEqual([]);
  });
});
