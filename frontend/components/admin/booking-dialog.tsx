'use client';

import * as React from 'react';
import { ApiError, bookingApi, catalogApi } from '@/lib/api';
import { DEPOSIT_LABEL, STATUS_LABEL, formatDateTime, formatVnd } from '@/lib/format';
import type { Booking, Slot, Stylist } from '@/lib/types';
import { Alert } from '@/components/ui/alert';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';

export interface BookingDialogProps {
  booking: Booking | null;
  stylists: Stylist[];
  onClose: () => void;
  onChanged: () => void;
}

/** Chi tiết lịch hẹn + thao tác trạng thái + dời lịch (đường bàn phím cho kéo thả). */
export function BookingDialog({ booking, stylists, onClose, onChanged }: BookingDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [stylistId, setStylistId] = React.useState<string>('');

  React.useEffect(() => {
    setError(null);
    setNotice(null);
    setSlots([]);
    if (booking) {
      setStylistId(booking.stylist_id);
      catalogApi
        .slots({
          branchId: booking.branch_id,
          stylistId: booking.stylist_id,
          serviceId: booking.service_id,
          date: booking.start_time.slice(0, 10),
        })
        .then(setSlots)
        .catch(() => setSlots([]));
    }
  }, [booking]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      onChanged();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSlotsForStylist(nextStylistId: string) {
    if (!booking) return;
    setStylistId(nextStylistId);
    try {
      const result = await catalogApi.slots({
        branchId: booking.branch_id,
        stylistId: nextStylistId,
        serviceId: booking.service_id,
        date: booking.start_time.slice(0, 10),
      });
      setSlots(result);
    } catch {
      setSlots([]);
    }
  }

  return (
    <Dialog open={Boolean(booking)} onOpenChange={(open) => (open ? undefined : onClose())}>
      {booking ? (
        <DialogContent title="Chi tiết lịch hẹn" description={`Mã ${booking.id}`}>
          <div className="flex flex-col gap-2 text-body-sm">
            <Row label="Khách hàng" value={`${booking.customer?.name ?? ''} · ${booking.customer?.phone ?? ''}`} />
            <Row label="Dịch vụ" value={`${booking.service?.name ?? ''} (${booking.service?.duration_minutes ?? ''} phút)`} />
            <Row label="Thời gian" value={formatDateTime(booking.start_time)} />
            <Row label="Stylist" value={booking.stylist?.name ?? ''} />
            <Row label="Trạng thái" value={<Badge tone={booking.status === 'completed' ? 'success' : booking.status === 'cancelled' ? 'danger' : 'info'}>{STATUS_LABEL[booking.status]}</Badge>} />
            <Row label="Tiền cọc" value={`${formatVnd(booking.deposit_amount)} · ${DEPOSIT_LABEL[booking.deposit_status]}`} />
            <Row label="Tạm tính" value={formatVnd(booking.price - booking.discount_amount)} />
            {booking.discount_amount > 0 ? <Row label="Giảm giá loyalty" value={`−${formatVnd(booking.discount_amount)}`} /> : null}
            {booking.note ? <Row label="Ghi chú" value={booking.note} /> : null}
          </div>

          {error ? <Alert tone="danger" title={error} className="mt-3" /> : null}
          {notice ? <Alert tone="success" title={notice} className="mt-3" /> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" loading={busy} onClick={() => void run(() => bookingApi.complete(booking.id), 'Đã đánh dấu hoàn tất.')}>
              Hoàn tất
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => void run(() => bookingApi.noShow(booking.id), 'Đã đánh dấu khách không đến.')}
            >
              Không đến
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              onClick={() => void run(() => bookingApi.cancel(booking.id), 'Đã hủy lịch hẹn.')}
            >
              Hủy lịch
            </Button>
          </div>

          <Card className="mt-4">
            <div className="flex flex-col gap-2 px-3 py-3">
              <p className="text-body-sm font-medium text-ink">Dời lịch (đường bàn phím)</p>
              <div>
                <Select
                  aria-label="Chọn stylist"
                  value={stylistId}
                  onChange={(event) => void loadSlotsForStylist(event.target.value)}
                >
                  {stylists.map((stylist) => (
                    <option key={stylist.id} value={stylist.id}>
                      {stylist.name}
                    </option>
                  ))}
                </Select>
              </div>
              {slots.length === 0 ? (
                <p className="text-body-sm text-muted">Không còn khung giờ trống trong ngày này cho stylist đã chọn.</p>
              ) : (
                <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto thin-scroll">
                  {slots.slice(0, 40).map((slot) => (
                    <Button
                      key={slot.start_time}
                      size="sm"
                      variant="outline"
                      loading={busy}
                      onClick={() => void run(() => bookingApi.reschedule(booking.id, slot.start_time), 'Đã dời lịch hẹn.')}
                    >
                      {slot.start_time.slice(11, 16)}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-meta text-muted">
                Chỉ dời được khi còn cách giờ hẹn ≥ 24 giờ; hệ thống kiểm tra trùng lịch lại từ đầu.
              </p>
            </div>
          </Card>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
