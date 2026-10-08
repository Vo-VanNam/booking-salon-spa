/** Validate phía client (mirror của ràng buộc server — DOCUMENT.md §8). */

export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) return `0${digits.slice(3)}`;
  return digits;
}

export function isValidVnPhone(raw: string): boolean {
  return /^0(3|5|7|8|9)\d{8}$/.test(normalizePhone(raw));
}

export function isValidEmail(raw: string): boolean {
  const value = (raw ?? '').trim();
  if (!value) return true; // email là tuỳ chọn
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value);
}

export function phoneError(raw: string): string | null {
  if (!raw?.trim()) return 'Vui lòng nhập số điện thoại.';
  if (!isValidVnPhone(raw)) return 'Số điện thoại chưa đúng: cần 10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.';
  return null;
}

export function emailError(raw: string): string | null {
  if (!raw?.trim()) return null;
  return isValidEmail(raw) ? null : 'Email chưa đúng định dạng.';
}

export function nameError(raw: string): string | null {
  if (!raw?.trim()) return 'Vui lòng nhập tên khách hàng.';
  if (raw.trim().length < 2) return 'Tên quá ngắn.';
  return null;
}
