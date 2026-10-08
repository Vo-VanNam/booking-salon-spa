'use client';

import * as React from 'react';
import { BarChart3 } from 'lucide-react';
import { adminApi, ApiError } from '@/lib/api';
import { formatDate, formatTime, formatVnd, vnDateKey } from '@/lib/format';
import type { RevenueResponse } from '@/lib/types';
import { useAdminBranch } from '@/lib/use-admin-branch';
import { Alert } from '@/components/ui/alert';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { KpiCard, KpiSkeleton } from '@/components/admin/kpi-card';

export default function AdminRevenuePage() {
  const { branchId, ready } = useAdminBranch();
  // Cửa sổ mặc định rộng hơn "30 ngày qua": lịch hẹn có thể được đánh dấu hoàn tất trước ngày hẹn,
  // nên báo cáo cần bao gồm cả các ngày sắp tới để không hiển thị sai thành 0đ.
  const [from, setFrom] = React.useState<string>(vnDateKey(-30));
  const [to, setTo] = React.useState<string>(vnDateKey(30));
  const [revenue, setRevenue] = React.useState<RevenueResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string>(formatTime(new Date()));

  const load = React.useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.revenue({ branchId: branchId || undefined, from, to });
      setRevenue(data);
      setUpdatedAt(formatTime(new Date()));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to, ready]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const maxDay = Math.max(1, ...(revenue?.by_day.map((item) => item.total_revenue) ?? [1]));
  const maxMonth = Math.max(1, ...(revenue?.by_month.map((item) => item.total_revenue) ?? [1]));

  return (
    <main className="px-4 py-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Doanh thu</h1>
          <p className="text-body-sm text-muted tnum">
            {formatDate(`${from}T00:00:00+07:00`)} – {formatDate(`${to}T00:00:00+07:00`)} · Cập nhật lúc {updatedAt}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-body-sm text-muted">
            Từ ngày
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="ml-2 rounded-control border border-border bg-surface px-2 py-1.5 text-body-sm tnum"
            />
          </label>
          <label className="text-body-sm text-muted">
            Đến ngày
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="ml-2 rounded-control border border-border bg-surface px-2 py-1.5 text-body-sm tnum"
            />
          </label>
        </div>
      </header>

      {error ? <Alert tone="danger" title={error} className="mb-3" action={<button className="rounded-control border border-border-strong px-3 py-1.5 text-body-sm" onClick={() => void load()}>Thử lại</button>} /> : null}

      <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Chỉ số doanh thu">
        {loading && !revenue ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <KpiCard label="Tổng doanh thu" value={formatVnd(revenue?.total_revenue ?? 0)} tone="success" />
            <KpiCard label="Lịch hoàn tất" value={revenue?.completed_bookings ?? 0} />
            <KpiCard label="Tiền cọc đã thu" value={formatVnd(revenue?.deposit_collected ?? 0)} />
            <KpiCard
              label="Chi nhánh dẫn đầu"
              value={revenue?.by_branch[0]?.branch_name ?? '—'}
              hint={revenue?.by_branch[0] ? formatVnd(revenue.by_branch[0].total_revenue) : 'Chưa có dữ liệu'}
            />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="px-3 py-3">
          <p className="text-body font-medium text-ink">Theo chi nhánh</p>
          {loading && !revenue ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : (revenue?.by_branch.length ?? 0) === 0 ? (
            <EmptyState className="mt-3" icon={<BarChart3 size={18} />} title="Chưa có lịch nào hoàn tất" description="Doanh thu được ghi nhận khi lịch hẹn ở trạng thái Hoàn tất." />
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {revenue?.by_branch.map((item) => (
                <li key={item.branch_id} className="flex items-center justify-between gap-3 text-body-sm">
                  <span className="text-ink">{item.branch_name}</span>
                  <span className="tnum text-ink">
                    {formatVnd(item.total_revenue)} · {item.completed_bookings} lịch
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="px-3 py-3">
          <p className="text-body font-medium text-ink">Theo tháng</p>
          {loading && !revenue ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : (revenue?.by_month.length ?? 0) === 0 ? (
            <p className="mt-2 text-body-sm text-muted">Chưa có dữ liệu trong khoảng đã chọn.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {revenue?.by_month.slice(0, 6).map((item) => (
                <li key={item.month} className="text-body-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink tnum">{item.month}</span>
                    <span className="tnum text-ink">{formatVnd(item.total_revenue)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${Math.max(4, (item.total_revenue / maxMonth) * 100)}%` }}
                      role="img"
                      aria-label={`${item.month}: ${formatVnd(item.total_revenue)}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4 px-3 py-3">
        <p className="text-body font-medium text-ink">Theo ngày (30 ngày gần nhất trong khoảng)</p>
        {loading && !revenue ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : (revenue?.by_day.length ?? 0) === 0 ? (
          <p className="mt-2 text-body-sm text-muted">Chưa có ngày nào phát sinh doanh thu.</p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-1.5">
              {revenue?.by_day.slice(0, 30).map((item) => (
                <li key={item.date} className="flex items-center gap-3 text-body-sm">
                  <span className="w-24 shrink-0 text-muted tnum">{formatDate(`${item.date}T00:00:00+07:00`)}</span>
                  <span className="h-3 flex-1 rounded-full bg-surface-2">
                    <span
                      className="block h-3 rounded-full bg-accent"
                      style={{ width: `${Math.max(3, (item.total_revenue / maxDay) * 100)}%` }}
                      role="img"
                      aria-label={`${item.date}: ${formatVnd(item.total_revenue)}`}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right tnum text-ink">{formatVnd(item.total_revenue)}</span>
                </li>
              ))}
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-body-sm text-accent">Xem bảng số liệu</summary>
              <table className="mt-2 w-full text-body-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-meta uppercase text-muted">
                    <th className="px-2 py-1">Ngày</th>
                    <th className="px-2 py-1 text-right">Doanh thu</th>
                    <th className="px-2 py-1 text-right">Lịch hoàn tất</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue?.by_day.map((item) => (
                    <tr key={item.date} className="border-b border-border">
                      <td className="px-2 py-1 tnum">{item.date}</td>
                      <td className="px-2 py-1 text-right tnum">{item.total_revenue}</td>
                      <td className="px-2 py-1 text-right tnum">{item.completed_bookings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </Card>
    </main>
  );
}
