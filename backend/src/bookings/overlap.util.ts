/**
 * Logic kiểm tra trùng lịch — thuần tuý, không phụ thuộc DB để unit test được (DOCUMENT.md §4.1).
 * Điều kiện overlap chuẩn: NOT (a.end <= b.start OR a.start >= b.end).
 */

export interface Interval {
  start: Date;
  end: Date;
}

export interface RangeMinutes {
  startMin: number;
  endMin: number;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return !(aEnd.getTime() <= bStart.getTime() || aStart.getTime() >= bEnd.getTime());
}

export function findOverlap<T extends Interval>(candidate: Interval, existing: readonly T[]): T | undefined {
  return existing.find((item) => rangesOverlap(candidate.start, candidate.end, item.start, item.end));
}

export function minutesOverlap(a: RangeMinutes, b: RangeMinutes): boolean {
  return !(a.endMin <= b.startMin || a.startMin >= b.endMin);
}

/** Khung [startMin, endMin) phải nằm trọn trong MỘT khung giờ làm việc nào đó. */
export function isCoveredByRanges(startMin: number, endMin: number, ranges: readonly RangeMinutes[]): boolean {
  return ranges.some((range) => startMin >= range.startMin && endMin <= range.endMin);
}

/** Sinh các mốc bắt đầu khả thi trong một khung, bước nhảy cố định. */
export function buildStarts(range: RangeMinutes, durationMinutes: number, stepMinutes: number): number[] {
  const step = Math.max(1, stepMinutes);
  const starts: number[] = [];
  for (let minute = range.startMin; minute + durationMinutes <= range.endMin; minute += step) {
    starts.push(minute);
  }
  return starts;
}
