'use client';

import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminApi, api, ApiError, catalogApi } from '@/lib/api';
import { formatDate, formatTime, vnDateKey } from '@/lib/format';
import type { Booking, DashboardResponse, Stylist } from '@/lib/types';
import { useAdminBranch } from '@/lib/use-admin-branch';
import { Alert } from '@/components/ui/alert';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarBoard } from '@/components/admin/calendar-board';
import { BookingDialog } from '@/components/admin/booking-dialog';
import { KpiCard, KpiSkeleton } from '@/components/admin/kpi-card';

export default function AdminCalendarPage() {
  const { branchId, ready } = useAdminBranch();
  const [date, setDate] = React.useState<string>(vnDateKey(0));
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [stylists, setStylists] = React.useState<Stylist[]>([]);
  const [dashboard, setDashboard] = React.useState<DashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Booking | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string>(formatTime(new Date()));

  const branchForCatalog = branchId || undefined;

  const load = React.useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [bookingList, dashboardData] = await Promise.all([
        adminApi.bookings({ branchId: branchForCatalog, from: `${date}T00:00:00+07:00`, to: `${date}T23:59:59+07:00` }),
        branchForCatalog
          ? adminApi.dashboard({ branchId: branchForCatalog, date })
          : adminApi.dashboard({ date }),
      ]);
      setBookings(bookingList);
      setDashboard(dashboardData);
      setUpdatedAt(formatTime(new Date()));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [branchForCatalog, date, ready]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    async function loadCatalog() {
      if (!ready) return;
      try {
        if (branchId) {
          setStylists(await catalogApi.stylists(branchId, true));
          return;
        }
        const branches = await catalogApi.branches();
        const lists = await Promise.all(branches.map((branch) => catalogApi.stylists(branch.id, true)));
        setStylists(lists.flat());
      } catch {
        setStylists([]);
      }
    }
    void loadCatalog();
  }, [branchId, ready]);

  function shiftDate(days: number) {
    setDate(vnDateKey(days, new Date(`${date}T12:00:00+07:00`)));
  }

  async function handleMove(booking: Booking, newStart: Date, newStylistId: string) {
    setError(null);
    try {
      await api(`/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        body: { start_time: newStart.toISOString(), stylist_id: newStylistId },
      });
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const boardStylists = stylists;

  return (
    <main className="px-4 py-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Lịch chi nhánh</h1>
          <p className="text-body-sm text-muted tnum">
            {formatDate(`${date}T00:00:00+07:00`)} · Cập nhật lúc {updatedAt}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" aria-label="Ngày trước" onClick={() => shiftDate(-1)}>
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDate(vnDateKey(0))}>
            Hôm nay
          </Button>
          <Button size="sm" variant="outline" aria-label="Ngày sau" onClick={() => shiftDate(1)}>
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Chỉ số nhanh">
        {loading && !dashboard ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <KpiCard label="Lịch hôm nay" value={dashboard?.bookings_total ?? 0} hint={`${dashboard?.upcoming_bookings ?? 0} lịch sắp tới`} />
            <KpiCard label="Doanh thu hôm nay" value={`${new Intl.NumberFormat('vi-VN').format(dashboard?.revenue_today ?? 0)}đ`} tone="success" />
            <KpiCard label="Stylist đang làm" value={dashboard?.active_stylists ?? 0} />
            <KpiCard
              label="Lịch kế tiếp"
              value={dashboard?.next_booking ? formatTime(dashboard.next_booking.start_time) : '—'}
              hint={dashboard?.next_booking ? `${dashboard.next_booking.customer_name} · ${dashboard.next_booking.service_name}` : 'Chưa có lịch nào'}
            />
          </>
        )}
      </section>

      {error ? (
        <Alert tone="danger" title={error} className="mb-3" action={<Button size="sm" variant="outline" onClick={() => void load()}>Thử lại</Button>} />
      ) : null}

      <Card className="px-3 py-3">
        {loading && bookings.length === 0 ? (
          <Skeleton className="h-72 w-full" />
        ) : boardStylists.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={20} />}
            title="Chưa có stylist nào đang hoạt động"
            description="Thêm stylist cho chi nhánh trước khi xếp lịch."
          />
        ) : (
          <CalendarBoard
            bookings={bookings}
            stylists={boardStylists}
            loading={false}
            onSelect={setSelected}
            onMove={(booking, newStart, newStylistId) => void handleMove(booking, newStart, newStylistId)}
          />
        )}
      </Card>

      <BookingDialog booking={selected} stylists={boardStylists} onClose={() => setSelected(null)} onChanged={() => void load()} />
    </main>
  );
}
