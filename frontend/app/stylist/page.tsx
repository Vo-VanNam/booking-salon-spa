'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, LogOut } from 'lucide-react';
import { ApiError, clearSession, getStoredUser, loadProfile, stylistApi } from '@/lib/api';
import { STATUS_LABEL, formatDate, formatDateTime, formatTime, relativeDayLabel, vnDateKey } from '@/lib/format';
import type { AuthUser, Booking } from '@/lib/types';
import { Alert } from '@/components/ui/alert';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Trang stylist, tối ưu cho điện thoại (DOCUMENT.md §2.7): lịch cá nhân theo ngày/tuần. */
export default function StylistPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string>(formatTime(new Date()));

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await stylistApi.bookings();
      setBookings(data);
      setUpdatedAt(formatTime(new Date()));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/login');
      return;
    }
    if (stored.role !== 'stylist') {
      router.replace(stored.role === 'branch_admin' || stored.role === 'super_admin' ? '/admin' : '/login');
      return;
    }
    loadProfile()
      .then(setUser)
      .catch(() => {
        clearSession();
        router.replace('/login');
      });
    void load();
  }, [router, load]);

  const today = vnDateKey(0);
  const todays = bookings.filter((booking) => booking.start_time.slice(0, 10) === today);
  const upcoming = bookings.filter((booking) => booking.start_time.slice(0, 10) > today);
  const next = todays.find((booking) => new Date(booking.start_time).getTime() >= Date.now()) ?? upcoming[0];

  if (!user) {
    return <main className="p-6 text-body-sm text-muted">Đang tải lịch làm việc…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-meta uppercase tracking-wide text-muted">Lịch của tôi</p>
          <h1 className="text-title font-semibold text-ink">{user.name}</h1>
          <p className="text-body-sm text-muted tnum">
            {formatDate(new Date())} · Cập nhật lúc {updatedAt}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearSession();
            router.replace('/login');
          }}
          className="flex items-center gap-1 rounded-control border border-border px-2.5 py-1.5 text-meta text-danger hover:bg-surface-2"
        >
          <LogOut size={14} aria-hidden /> Đăng xuất
        </button>
      </header>

      {error ? <Alert tone="danger" title={error} className="mb-3" action={<Button size="sm" variant="outline" onClick={() => void load()}>Thử lại</Button>} /> : null}

      {next ? (
        <Card className="mb-4 border-[#DCCDB8] bg-accent-soft">
          <div className="px-4 py-3">
            <p className="text-meta uppercase tracking-wide text-accent">Ca kế tiếp</p>
            <p className="text-section font-semibold text-ink tnum">{formatDateTime(next.start_time)}</p>
            <p className="text-body-sm text-ink">
              {next.customer?.name} · {next.service?.name} ({next.service?.duration_minutes} phút)
            </p>
          </div>
        </Card>
      ) : null}

      {loading && bookings.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <section className="mb-5">
          <h2 className="mb-2 text-section font-semibold text-ink">{relativeDayLabel(today)}</h2>
          {todays.length === 0 ? (
            <EmptyState icon={<CalendarClock size={20} />} title="Hôm nay chưa có lịch hẹn" description="Bạn có thể nghỉ ngơi hoặc kiểm tra lịch tuần này bên dưới." />
          ) : (
            <ul className="flex flex-col gap-2">
              {todays.map((booking) => (
                <BookingRow key={booking.id} booking={booking} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-section font-semibold text-ink">Lịch sắp tới</h2>
        {upcoming.length === 0 ? (
          <p className="text-body-sm text-muted">Chưa có lịch hẹn nào trong những ngày tới.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.slice(0, 20).map((booking) => (
              <BookingRow key={booking.id} booking={booking} showDate />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-meta text-muted">
        Cần hỗ trợ? Liên hệ quản lý chi nhánh. Xem lịch khách đặt mới nhất sau khi làm mới trang.{' '}
        <Link href="/" className="text-accent underline">
          Trang khách
        </Link>
      </p>
    </main>
  );
}

function BookingRow({ booking, showDate = false }: { booking: Booking; showDate?: boolean }) {
  const tone =
    booking.status === 'completed' ? 'success' : booking.status === 'cancelled' ? 'danger' : booking.status === 'no_show' ? 'warning' : 'info';
  return (
    <li>
      <Card>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div>
            <p className="text-body font-medium text-ink tnum">
              {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
              {showDate ? <span className="ml-2 text-body-sm text-muted">{formatDate(booking.start_time)}</span> : null}
            </p>
            <p className="text-body-sm text-ink">{booking.customer?.name}</p>
            <p className="text-body-sm text-muted">
              {booking.service?.name} · {booking.service?.duration_minutes} phút
            </p>
          </div>
          <Badge tone={tone}>{STATUS_LABEL[booking.status]}</Badge>
        </div>
      </Card>
    </li>
  );
}
