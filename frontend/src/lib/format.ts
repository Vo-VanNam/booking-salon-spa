import { format } from "date-fns";
import { vi } from "date-fns/locale";

/** Định dạng ngày kiểu Việt Nam: dd/MM/yyyy */
export function formatVnDate(
  date: Date | string,
  pattern = "dd/MM/yyyy",
): string {
  return format(toDate(date), pattern, { locale: vi });
}

/** Giờ 24h "HH:mm" theo múi giờ máy người dùng */
export function formatVnTime(date: Date | string): string {
  return format(toDate(date), "HH:mm", { locale: vi });
}

/** Tiền VND: 150000 → "150.000đ" */
export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

/**
 * Chuyển ngày + giờ VN (Asia/Ho_Chi_Minh, UTC+7, không DST) sang ISO UTC
 * để gửi lên API. Ví dụ: ("2026-08-08", "09:30") → "2026-08-08T02:30:00.000Z"
 */
export function vnToUtcIso(dateVn: string, timeVn: string): string {
  return new Date(`${dateVn}T${timeVn}:00+07:00`).toISOString();
}

function toDate(date: Date | string): Date {
  return typeof date === "string" ? new Date(date) : date;
}
