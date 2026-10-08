/** Định dạng ngày/giờ theo chuẩn Việt Nam: dd/MM/yyyy, 24h, múi giờ Asia/Ho_Chi_Minh. */

const VN_TZ = 'Asia/Ho_Chi_Minh';

function parts(iso: string | Date): Record<string, string> {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const output: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) output[part.type] = part.value;
  return output;
}

export function formatDate(iso: string | Date): string {
  const p = parts(iso);
  return `${p.day}/${p.month}/${p.year}`;
}

export function formatTime(iso: string | Date): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

export function formatDateTime(iso: string | Date): string {
  return `${formatTime(iso)} ${formatDate(iso)}`;
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))}đ`;
}

/** 'HH:mm' → số phút từ 00:00 (dùng cho lưới lịch). */
export function hmToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map((item) => Number.parseInt(item, 10));
  return hours * 60 + minutes;
}

export function minutesToHm(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam (dùng cho query ?date=). */
export function vnDateKey(offsetDays = 0, from: Date = new Date()): string {
  const shifted = new Date(from.getTime() + offsetDays * 86_400_000);
  const p = parts(shifted);
  return `${p.year}-${p.month}-${p.day}`;
}

export function weekdayLabel(dayOfWeek: number): string {
  return ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][dayOfWeek] ?? '';
}

export function relativeDayLabel(dateKey: string): string {
  if (dateKey === vnDateKey(0)) return 'Hôm nay';
  if (dateKey === vnDateKey(1)) return 'Ngày mai';
  return formatDate(`${dateKey}T00:00:00+07:00`);
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  no_show: 'Không đến',
};

export const DEPOSIT_LABEL: Record<string, string> = {
  unpaid: 'Chưa cọc',
  pending: 'Đang xử lý',
  paid: 'Đã cọc',
  refunded: 'Đã hoàn cọc',
};
