import { Prisma } from '@prisma/client';

/**
 * Khoá + đọc dữ liệu chống race condition khi hai người cùng đặt một slot (DOCUMENT.md §4.1):
 *  1. pg_advisory_xact_lock theo stylist — tuần tự hoá mọi giao dịch ghi lịch của cùng một stylist,
 *     kể cả khi chưa có booking nào để khoá (trường hợp SELECT ... FOR UPDATE không khoá được gì);
 *  2. SELECT ... FOR UPDATE trên các booking hiện có trong khoảng thời gian liên quan.
 */

interface RawExecutor {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
}

export interface LockedBookingRow {
  id: string;
  start_time: Date;
  end_time: Date;
}

export async function lockStylist(tx: unknown, stylistId: string): Promise<void> {
  const executor = tx as RawExecutor;
  await executor.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stylistId}::text))`;
}

/**
 * Khoá theo KHÁCH HÀNG (namespace riêng "loyalty") — cần thiết vì khoá theo stylist không bảo vệ
 * trạng thái loyalty khi cùng một khách đặt hai lịch ở hai stylist khác nhau.
 */
export async function lockCustomer(tx: unknown, phone: string): Promise<void> {
  const executor = tx as RawExecutor;
  await executor.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('loyalty'), hashtext(${phone}::text))`;
}

/** Trả về các booking đang chiếm chỗ (đã khoá row) — rỗng nghĩa là khung giờ còn trống. */
export async function lockOverlappingBookings(
  tx: unknown,
  stylistId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string,
): Promise<LockedBookingRow[]> {
  const executor = tx as RawExecutor;
  const rows = (await executor.$queryRaw`
    SELECT id, start_time, end_time
    FROM bookings
    WHERE stylist_id = ${stylistId}
      AND status NOT IN ('cancelled', 'no_show')
      AND start_time < ${end}
      AND end_time > ${start}
      ${excludeBookingId ? Prisma.sql`AND id <> ${excludeBookingId}` : Prisma.empty}
    FOR UPDATE
  `) as LockedBookingRow[];
  return rows ?? [];
}
