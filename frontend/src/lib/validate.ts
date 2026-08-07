// Trùng chuẩn với backend (backend/src/common/validators/vn-phone.ts):
// 10 chữ số, bắt đầu 03/05/07/08/09.
export const VN_PHONE_REGEX = /^(03|05|07|08|09)\d{8}$/;

export function isVnPhone(value: string): boolean {
  return VN_PHONE_REGEX.test(value);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export const PHONE_ERROR_MESSAGE =
  "Số điện thoại không hợp lệ (yêu cầu 10 số, đầu 03/05/07/08/09)";
export const EMAIL_ERROR_MESSAGE = "Email không hợp lệ";
