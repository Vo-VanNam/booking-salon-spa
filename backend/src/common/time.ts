/**
 * Tiện ích thời gian — mọi mốc thời gian lưu trong DB là UTC, mọi trao đổi với người dùng
 * theo Asia/Ho_Chi_Minh (DOCUMENT.md §3). Việt Nam cố định UTC+7, không có DST.
 */

export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const VN_OFFSET_MINUTES = 420;
const VN_OFFSET_MS = VN_OFFSET_MINUTES * 60_000;

export interface VnDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Chủ nhật … 6 = Thứ bảy
  dateKey: string; // YYYY-MM-DD (giờ VN)
  timeKey: string; // HH:mm (giờ VN)
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Tách một mốc UTC thành các thành phần theo giờ Việt Nam. */
export function vnParts(instant: Date): VnDateParts {
  const shifted = new Date(instant.getTime() + VN_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();
  const dateKey = `${year}-${pad(month)}-${pad(day)}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    dateKey,
    timeKey: `${pad(hour)}:${pad(minute)}`,
  };
}

export function vnDateKey(instant: Date): string {
  return vnParts(instant).dateKey;
}

export function vnTimeKey(instant: Date): string {
  return vnParts(instant).timeKey;
}

/** ISO 8601 kèm offset +07:00 — định dạng mà harness/API dùng cho start_time. */
export function toVnIso(instant: Date): string {
  const shifted = new Date(instant.getTime() + VN_OFFSET_MS);
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+07:00`
  );
}

/** dd/MM/yyyy theo chuẩn Việt Nam. */
export function formatVnDate(instant: Date): string {
  const parts = vnParts(instant);
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
}

/** dd/MM/yyyy HH:mm (24h). */
export function formatVnDateTime(instant: Date): string {
  const parts = vnParts(instant);
  return `${formatVnDate(instant)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 'HH:mm' → số phút từ 00:00. */
export function hmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToHm(total: number): string {
  const hours = Math.floor(total / 60);
  return `${pad(hours)}:${pad(total % 60)}`;
}

/** Một mốc giờ VN (YYYY-MM-DD + HH:mm) → Date UTC. */
export function vnLocalToUtc(dateKey: string, timeKey: string): Date {
  const iso = `${dateKey}T${timeKey.length === 5 ? `${timeKey}:00` : timeKey}+07:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Thời gian không hợp lệ: ${dateKey} ${timeKey}`);
  }
  return parsed;
}

/** Khoảng UTC của một ngày theo giờ VN: [00:00, 24:00). */
export function vnDayRangeUtc(dateKey: string): { start: Date; end: Date } {
  const start = vnLocalToUtc(dateKey, '00:00');
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/**
 * Phân tích chuỗi thời gian từ client:
 *  - ISO 8601 có offset/Z → dùng nguyên;
 *  - 'YYYY-MM-DD HH:mm[:ss]' hoặc 'YYYY-MM-DDTHH:mm[:ss]' không offset → hiểu là giờ Việt Nam.
 */
export function parseInstant(input: string): Date | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  const naive = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/.exec(trimmed);
  if (naive) {
    const timePart = naive[2].length === 5 ? `${naive[2]}:00` : naive[2];
    const parsed = new Date(`${naive[1]}T${timePart}+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 'HH:mm' của một mốc UTC theo giờ VN. */
export function vnHm(instant: Date): string {
  return vnTimeKey(instant);
}
