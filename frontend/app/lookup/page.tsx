'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck2, Clock, Scissors, User } from 'lucide-react';
import { ApiError, bookingApi } from '@/lib/api';
import { DEPOSIT_LABEL, STATUS_LABEL, formatDate, formatDateTime, formatTime, formatVnd } from '@/lib/format';
import type { Booking } from '@/lib/types';
import { Alert } from '@/components/ui/alert';
import { Badge, Card, EmptyState } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

/** Tra cứu/hủy/đặt cọc lịch hẹn theo số điện thoại (DOCUMENT.md §2.2). */
export default function LookupPage() {
  const [phone, setPhone] = React.useState('');
  const [bookings, setBookings] = React.useState<Booking[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bookingApi.byPhone(phone.trim());
      setBookings(result);
    } catch (err) {
      setError((err as ApiError).message);
      setBookings(null);
    } finally {
      setLoading(false);
    }
  }

  async function cancel(id: string) {
    setNotice(null);
    setError(null);
    try {
      await bookingApi.cancel(id);
      setNotice('Đã hủy lịch hẹn.');
      setBookings((current) => current?.map((item) => (item.id === id ? { ...item, status: 'cancelled' } : item)) ?? null);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <nav className="mb-4 flex items-center justify-between text-body-sm">
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          ← Đặt lịch
        </Link>
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Nhân viên
        </Link>
      </nav>

      <h1 className="text-title font-semibold text-ink">Tra cứu lịch hẹn</h1>
      <p className="mt-1 text-body-sm text-muted">
        Nhập số điện thoại đã dùng khi đặt lịch để xem, hủy hoặc đặt cọc lịch hẹn.
      </p>

      <form onSubmit={search} className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="lookup-phone">Số điện thoại</Label>
          <Input
            id="lookup-phone"
            value={phone}
            inputMode="tel"
            placeholder="09xxxxxxxx"
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <Button type="submit" loading={loading}>
          Tra cứu
        </Button>
      </form>

      {error ? <Alert tone="danger" title={error} className="mt-3" /> : null}
      {notice ? <Alert tone="success" title={notice} className="mt-3" /> : null}

      <div className="mt-4 flex flex-col gap-3">
        {bookings === null ? null : bookings.length === 0 ? (
          <EmptyState
            title="Không tìm thấy lịch hẹn nào"
            description="Kiểm tra lại số điện thoại, hoặc đặt lịch mới từ trang chủ."
            action={
              <Link
                href="/"
                className="mt-2 rounded-control bg-accent px-4 py-2 text-body-sm font-medium text-surface hover:bg-accent-hover"
              >
                Đặt lịch mới
              </Link>
            }
          />
        ) : (
          bookings.map((booking) => (
            <Card key={booking.id}>
              <div className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body font-medium text-ink">{booking.service?.name}</p>
                    <p className="text-body-sm text-muted tnum">
                      {formatDateTime(booking.start_time)} – {formatTime(booking.end_time)} · {booking.branch?.name}
                    </p>
                  </div>
                  <Badge
                    tone={
                      booking.status === 'completed'
                        ? 'success'
                        : booking.status === 'cancelled'
                          ? 'danger'
                          : booking.status === 'no_show'
                            ? 'warning'
                            : 'info'
                    }
                  >
                    {STATUS_LABEL[booking.status]}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted">
                  <span className="flex items-center gap-1">
                    <User size={14} aria-hidden /> {booking.stylist?.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} aria-hidden /> cọc {formatVnd(booking.deposit_amount)} · {DEPOSIT_LABEL[booking.deposit_status]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Scissors size={14} aria-hidden /> {formatVnd(booking.price - booking.discount_amount)}
                  </span>
                </div>
                {booking.status === 'confirmed' || booking.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void cancel(booking.id)}>
                      Hủy lịch
                    </Button>
                    {booking.deposit_status !== 'paid' ? (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={async () => {
                          try {
                            const result = await bookingApi.deposit(booking.id, 'vnpay');
                            window.location.href = result.payment_url;
                          } catch (err) {
                            setError((err as ApiError).message);
                          }
                        }}
                      >
                        <CalendarCheck2 size={14} aria-hidden /> Đặt cọc
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-meta text-muted">
                  Hủy/đổi lịch được chấp nhận khi còn cách giờ hẹn ≥ 24 giờ (ngày {formatDate(booking.start_time)}).
                </p>
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
