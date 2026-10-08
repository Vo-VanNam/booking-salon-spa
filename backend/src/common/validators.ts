/** Chuẩn hoá + kiểm tra dữ liệu người dùng nhập theo yêu cầu nghiệp vụ Việt Nam (DOCUMENT.md §3, §8). */

/** 10 số, đầu 03/05/07/08/09 (chấp nhận +84 ở đầu vào và chuẩn hoá về dạng 0xxxxxxxxx). */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) return `0${digits.slice(3)}`;
  if (digits.startsWith('84') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

export function isValidVnPhone(raw: string): boolean {
  return /^0(3|5|7|8|9)\d{8}$/.test(normalizePhone(raw));
}

export function isValidEmail(raw: string): boolean {
  const value = (raw ?? '').trim();
  if (value.length === 0 || value.length > 254) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value);
}

export function normalizeEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Loại bỏ ký tự điều khiển, gộp khoảng trắng — chống injection vào log/DB. */
export function sanitizeText(raw: string, maxLength = 500): string {
  return (raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isSafeIdentifier(raw: string, maxLength = 64): boolean {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(raw);
}

/** Làm tròn tiền VND (bội số 1.000đ). */
export function roundVnd(amount: number, step = 1000): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount / step) * step;
}
