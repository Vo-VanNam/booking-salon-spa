'use client';

import * as React from 'react';
import { Plus, Users } from 'lucide-react';
import { adminApi, ApiError, catalogApi } from '@/lib/api';
import { formatDateTime, weekdayLabel } from '@/lib/format';
import type { Stylist, WorkingHour } from '@/lib/types';
import { useAdminBranch } from '@/lib/use-admin-branch';
import { Alert } from '@/components/ui/alert';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];

export default function AdminStylistsPage() {
  const { branchId, ready } = useAdminBranch();
  const [branches, setBranches] = React.useState<{ id: string; name: string }[]>([]);
  const [stylists, setStylists] = React.useState<Stylist[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<Stylist | null>(null);
  const [hours, setHours] = React.useState<Record<number, { start_time: string; end_time: string; enabled: boolean }>>({});

  const targetBranch = branchId || branches[0]?.id || '';

  React.useEffect(() => {
    catalogApi.branches().then(setBranches).catch((err: ApiError) => setError(err.message));
  }, []);

  const load = React.useCallback(async () => {
    if (!targetBranch || !ready) return;
    setLoading(true);
    try {
      const list = await catalogApi.stylists(targetBranch, true);
      const detailed = await Promise.all(list.map((stylist) => catalogApi.stylist(stylist.id)));
      setStylists(detailed);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [targetBranch, ready]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.createStylist({
        branch_id: targetBranch,
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      setForm({ name: '', phone: '', email: '' });
      setNotice('Đã thêm stylist với giờ làm việc mặc định 08:00–20:00 cả tuần.');
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function openHours(stylist: Stylist) {
    setEditing(stylist);
    setError(null);
    setNotice(null);
    const next: Record<number, { start_time: string; end_time: string; enabled: boolean }> = {};
    for (const day of ALL_DAYS) {
      const found = stylist.working_hours?.find((item: WorkingHour) => item.day_of_week === day);
      next[day] = found
        ? { start_time: found.start_time, end_time: found.end_time, enabled: found.is_active !== false }
        : { start_time: '08:00', end_time: '20:00', enabled: false };
    }
    setHours(next);
  }

  async function saveHours() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const payload = ALL_DAYS.filter((day) => hours[day]?.enabled).map((day) => ({
        day_of_week: day,
        start_time: hours[day].start_time,
        end_time: hours[day].end_time,
        is_active: true,
      }));
      await adminApi.setWorkingHours(editing.id, payload);
      setNotice(`Đã lưu lịch làm việc của ${editing.name}.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function addTimeOff(stylist: Stylist) {
    const start = window.prompt('Bắt đầu nghỉ (YYYY-MM-DD HH:mm)', `${new Date().toISOString().slice(0, 10)} 08:00`);
    if (!start) return;
    const end = window.prompt('Kết thúc nghỉ (YYYY-MM-DD HH:mm)', `${new Date().toISOString().slice(0, 10)} 12:00`);
    if (!end) return;
    try {
      await adminApi.addTimeOff(stylist.id, { start_time: start, end_time: end, reason: 'Nghỉ theo lịch chi nhánh' });
      setNotice(`Đã thêm khoảng nghỉ cho ${stylist.name}.`);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <main className="px-4 py-4">
      <header className="mb-3">
        <h1 className="text-title font-semibold text-ink">Stylist</h1>
        <p className="text-body-sm text-muted">
          Lịch làm việc theo từng ngày trong tuần, ngày nghỉ và trạng thái hoạt động. Khung giờ khách đặt được tính từ đây.
        </p>
      </header>

      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}
      {notice ? <Alert tone="success" title={notice} className="mb-3" /> : null}

      <Card className="mb-4">
        <form className="grid grid-cols-1 gap-3 px-3 py-3 md:grid-cols-4" onSubmit={submit}>
          <div>
            <Label htmlFor="stylist-name">Tên stylist</Label>
            <Input id="stylist-name" value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="stylist-phone">Số điện thoại</Label>
            <Input id="stylist-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="stylist-email">Email</Label>
            <Input id="stylist-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" loading={busy} className="w-full">
              <Plus size={16} aria-hidden /> Thêm stylist
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : stylists.length === 0 ? (
        <EmptyState icon={<Users size={20} />} title="Chi nhánh chưa có stylist" description="Thêm stylist để bắt đầu nhận lịch." />
      ) : (
        <div className="flex flex-col gap-3">
          {stylists.map((stylist) => (            <Card key={stylist.id}>
              <div className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-body font-medium text-ink">{stylist.name}</p>
                    <p className="text-body-sm text-muted">
                      {stylist.phone ?? 'Chưa có SĐT'} · {stylist.email ?? 'Chưa có email'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={stylist.is_active ? 'success' : 'neutral'}>{stylist.is_active ? 'Đang làm' : 'Tạm nghỉ'}</Badge>
                    <Button size="sm" variant="outline" onClick={() => openHours(stylist)}>
                      Giờ làm việc
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void addTimeOff(stylist)}>
                      Thêm ngày nghỉ
                    </Button>
                    <Button
                      size="sm"
                      variant={stylist.is_active ? 'ghost' : 'subtle'}
                      onClick={async () => {
                        try {
                          await adminApi.updateStylist(stylist.id, { is_active: !stylist.is_active });
                          await load();
                        } catch (err) {
                          setError((err as ApiError).message);
                        }
                      }}
                    >
                      {stylist.is_active ? 'Tạm nghỉ' : 'Kích hoạt'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 text-body-sm md:grid-cols-4">
                  {ALL_DAYS.map((day) => {
                    const item = stylist.working_hours?.find((hour: WorkingHour) => hour.day_of_week === day);
                    return (
                      <div key={day} className="flex items-center justify-between rounded-control border border-border px-2 py-1">
                        <span className="text-muted">{weekdayLabel(day)}</span>
                        <span className="tnum text-ink">{item ? `${item.start_time}–${item.end_time}` : 'Nghỉ'}</span>
                      </div>
                    );
                  })}
                </div>

                {stylist.time_off && stylist.time_off.length > 0 ? (
                  <div className="text-body-sm text-muted">
                    Ngày nghỉ sắp tới:{' '}
                    {stylist.time_off
                      .slice(0, 3)
                      .map((item) => `${formatDateTime(item.start_time)} → ${formatDateTime(item.end_time)}`)
                      .join(', ')}
                  </div>
                ) : null}

                {editing?.id === stylist.id ? (
                  <Card className="bg-surface-2">
                    <div className="flex flex-col gap-2 px-3 py-3">
                      <p className="text-body-sm font-medium text-ink">Chỉnh giờ làm việc theo tuần</p>
                      {ALL_DAYS.map((day) => (
                        <div key={day} className="flex items-center gap-3 text-body-sm">
                          <label className="flex w-28 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={hours[day]?.enabled ?? false}
                              onChange={(event) => setHours({ ...hours, [day]: { ...hours[day], enabled: event.target.checked } })}
                            />
                            {weekdayLabel(day)}
                          </label>
                          <Input
                            aria-label={`Giờ bắt đầu ${weekdayLabel(day)}`}
                            className="h-9 w-24"
                            value={hours[day]?.start_time ?? ''}
                            disabled={!hours[day]?.enabled}
                            onChange={(event) => setHours({ ...hours, [day]: { ...hours[day], start_time: event.target.value } })}
                          />
                          <span className="text-muted">→</span>
                          <Input
                            aria-label={`Giờ kết thúc ${weekdayLabel(day)}`}
                            className="h-9 w-24"
                            value={hours[day]?.end_time ?? ''}
                            disabled={!hours[day]?.enabled}
                            onChange={(event) => setHours({ ...hours, [day]: { ...hours[day], end_time: event.target.value } })}
                          />
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button size="sm" loading={busy} onClick={() => void saveHours()}>
                          Lưu giờ làm việc
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Hủy
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
