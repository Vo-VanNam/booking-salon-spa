'use client';

import * as React from 'react';
import { Plus, Scissors } from 'lucide-react';
import { adminApi, ApiError, catalogApi } from '@/lib/api';
import { DEPOSIT_LABEL, STATUS_LABEL, formatVnd } from '@/lib/format';
import type { Service } from '@/lib/types';
import { useAdminBranch } from '@/lib/use-admin-branch';
import { Alert } from '@/components/ui/alert';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const EMPTY_FORM = { name: '', price: '', duration_minutes: '', description: '' };

export default function AdminServicesPage() {
  const { branchId, ready } = useAdminBranch();
  const [branches, setBranches] = React.useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [busy, setBusy] = React.useState(false);

  const targetBranch = branchId || branches[0]?.id || '';

  React.useEffect(() => {
    catalogApi
      .branches()
      .then(setBranches)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const load = React.useCallback(async () => {
    if (!targetBranch || !ready) return;
    setLoading(true);
    try {
      setServices(await catalogApi.services(targetBranch, true));
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
      await adminApi.createService({
        branch_id: targetBranch,
        name: form.name.trim(),
        price: Number(form.price),
        duration_minutes: Number(form.duration_minutes),
        description: form.description.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setNotice('Đã thêm dịch vụ mới.');
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePrice(service: Service, price: number) {
    setError(null);
    try {
      await adminApi.updateService(service.id, { price });
      setNotice(`Đã cập nhật giá ${service.name}.`);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <main className="px-4 py-4">
      <header className="mb-3">
        <h1 className="text-title font-semibold text-ink">Dịch vụ &amp; giá</h1>
        <p className="text-body-sm text-muted">
          Giá và thời lượng theo từng chi nhánh. Thay đổi giá áp dụng cho các lịch hẹn tạo mới.
        </p>
      </header>

      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}
      {notice ? <Alert tone="success" title={notice} className="mb-3" /> : null}

      <Card className="mb-4">
        <form className="grid grid-cols-1 gap-3 px-3 py-3 md:grid-cols-4" onSubmit={submit}>
          <div className="md:col-span-2">
            <Label htmlFor="service-name">Tên dịch vụ</Label>
            <Input id="service-name" value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="service-price">Giá (VND)</Label>
            <Input
              id="service-price"
              value={form.price}
              required
              inputMode="numeric"
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="service-duration">Thời lượng (phút)</Label>
            <Input
              id="service-duration"
              value={form.duration_minutes}
              required
              inputMode="numeric"
              onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })}
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="service-description">Mô tả</Label>
            <Input
              id="service-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" loading={busy} className="w-full">
              <Plus size={16} aria-hidden /> Thêm dịch vụ
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Scissors size={20} />}
          title="Chi nhánh chưa có dịch vụ nào"
          description="Thêm dịch vụ đầu tiên để khách có thể đặt lịch."
        />
      ) : (
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-body-sm">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-2 text-left text-meta uppercase tracking-wide text-muted">
                <th className="rounded-tl-control px-3 py-2 font-medium">Dịch vụ</th>
                <th className="px-3 py-2 text-right font-medium">Giá</th>
                <th className="px-3 py-2 text-right font-medium">Thời lượng</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                <th className="rounded-tr-control px-3 py-2 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{service.name}</p>
                    <p className="text-meta text-muted">{service.description}</p>
                  </td>
                  <td className="px-3 py-2 text-right tnum">{formatVnd(service.price)}</td>
                  <td className="px-3 py-2 text-right tnum">{service.duration_minutes} phút</td>
                  <td className="px-3 py-2">
                    <Badge tone={service.is_active ? 'success' : 'neutral'}>{service.is_active ? 'Đang bán' : 'Đã ẩn'}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const input = window.prompt('Nhập giá mới (VND)', String(service.price));
                          if (input === null) return;
                          const price = Number(input.replace(/[^\d]/g, ''));
                          if (!Number.isFinite(price) || price < 0) {
                            setError('Giá không hợp lệ.');
                            return;
                          }
                          void updatePrice(service, price);
                        }}
                      >
                        Sửa giá
                      </Button>
                      {service.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await adminApi.deactivateService(service.id);
                              await load();
                            } catch (err) {
                              setError((err as ApiError).message);
                            }
                          }}
                        >
                          Ẩn
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-meta text-muted">
        Ghi chú: {STATUS_LABEL.confirmed} và {DEPOSIT_LABEL.unpaid} là trạng thái mặc định của lịch hẹn mới.
      </p>
    </main>
  );
}
