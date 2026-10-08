'use client';

import * as React from 'react';
import { Badge, Skeleton } from '@/components/ui/card';
import { STATUS_LABEL, formatTime, hmToMinutes, minutesToHm } from '@/lib/format';
import type { Booking, Stylist } from '@/lib/types';
import { cn } from '@/lib/utils';

const PX_PER_30MIN = 30;
const SNAP_MINUTES = 15;

const STATUS_TONE: Record<string, 'accent' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  confirmed: 'accent',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};

const STATUS_BG: Record<string, string> = {
  pending: 'bg-[#FBF0DC] border-[#E8D3A8]',
  confirmed: 'bg-accent-soft border-[#DCCDB8]',
  completed: 'bg-[#E7F3EC] border-[#BFDCCB]',
  cancelled: 'bg-surface-2 border-border opacity-60',
  no_show: 'bg-[#FBE9E7] border-[#F0C6C2]',
};

export interface CalendarBoardProps {
  bookings: Booking[];
  stylists: Stylist[];
  openTime?: string;
  closeTime?: string;
  loading?: boolean;
  onSelect: (booking: Booking) => void;
  onMove: (booking: Booking, newStart: Date, newStylistId: string) => void;
}

/**
 * Lịch ngày của chi nhánh: cột = stylist, hàng = giờ. Kéo thả để dời lịch (chuột/cảm ứng),
 * hoặc bấm vào lịch để mở hộp thoại (đường bàn phím).
 */
export function CalendarBoard({
  bookings,
  stylists,
  openTime = '08:00',
  closeTime = '20:00',
  loading = false,
  onSelect,
  onMove,
}: CalendarBoardProps) {
  const startMin = hmToMinutes(openTime);
  const endMin = hmToMinutes(closeTime);
  const totalMinutes = Math.max(60, endMin - startMin);
  const gridHeight = (totalMinutes / 30) * PX_PER_30MIN;
  const hours = React.useMemo(() => {
    const list: string[] = [];
    for (let minute = startMin; minute <= endMin; minute += 60) list.push(minutesToHm(minute));
    return list;
  }, [startMin, endMin]);

  const [drag, setDrag] = React.useState<{
    booking: Booking;
    offsetY: number;
    dy: number;
    dx: number;
    columnWidth: number;
  } | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);

  function positionFor(booking: Booking) {
    const start = hmToMinutes(formatTime(booking.start_time));
    const end = hmToMinutes(formatTime(booking.end_time));
    const top = ((start - startMin) / 30) * PX_PER_30MIN;
    const height = Math.max(24, ((end - start) / 30) * PX_PER_30MIN - 2);
    // Khối ngắn (≤ 45 phút) chỉ đủ chỗ cho 2 dòng: ẩn dòng dịch vụ để chữ không bị cắt dở.
    const showService = end - start >= 50;
    return { top, height, showService };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, booking: Booking) {
    const blockRect = event.currentTarget.getBoundingClientRect();
    const columnRect = event.currentTarget.parentElement?.getBoundingClientRect();
    setDrag({
      booking,
      offsetY: event.clientY - blockRect.top,
      dy: 0,
      dx: 0,
      columnWidth: columnRect?.width ?? 180,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    setDrag((current) => (current ? { ...current, dy: event.clientY - (event.currentTarget.getBoundingClientRect().top + current.offsetY), dx: event.movementX + current.dx } : current));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const { booking, dy, dx, columnWidth } = drag;
    setDrag(null);
    const snappedMinutes = Math.round((dy / PX_PER_30MIN) * 30 / SNAP_MINUTES) * SNAP_MINUTES;
    const columnShift = columnWidth > 0 ? Math.round(dx / columnWidth) : 0;
    if (snappedMinutes === 0 && columnShift === 0) {
      onSelect(booking);
      return;
    }

    const currentStart = new Date(booking.start_time);
    const localMinutes = hmToMinutes(formatTime(booking.start_time)) + snappedMinutes;
    const clamped = Math.min(Math.max(localMinutes, startMin), endMin - 30);
    // Giữ nguyên ngày, chỉ đổi giờ: tính chênh lệch phút so với giờ hiện tại (đã theo giờ VN).
    const deltaMinutes = clamped - hmToMinutes(formatTime(booking.start_time));
    const newStart = new Date(currentStart.getTime() + deltaMinutes * 60_000);

    const currentIndex = stylists.findIndex((item) => item.id === booking.stylist_id);
    const targetIndex = Math.min(Math.max(currentIndex + columnShift, 0), Math.max(stylists.length - 1, 0));
    const targetStylist = stylists[targetIndex]?.id ?? booking.stylist_id;

    onMove(booking, newStart, targetStylist);
    void event;
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto thin-scroll">
      <div className="min-w-[720px]">
        <div className="flex border-b border-border pb-2">
          <div className="w-16 shrink-0 text-meta text-muted">Giờ</div>
          {stylists.map((stylist) => (
            <div key={stylist.id} className="min-w-[180px] flex-1 px-2 text-body-sm font-medium text-ink">
              {stylist.name}
            </div>
          ))}
        </div>

        <div className="flex" ref={surfaceRef}>
          <div className="w-16 shrink-0" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative -top-2 text-meta text-muted tnum"
                style={{ height: (60 / 30) * PX_PER_30MIN }}
              >
                {hour}
              </div>
            ))}
          </div>

          {stylists.map((stylist) => (
            <div
              key={stylist.id}
              className="relative min-w-[180px] flex-1 border-l border-border"
              style={{ height: gridHeight }}
            >
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className={cn('border-t border-dashed border-border', index === 0 && 'border-solid')}
                  style={{ height: (60 / 30) * PX_PER_30MIN }}
                />
              ))}

              {bookings
                .filter((booking) => booking.stylist_id === stylist.id)
                .map((booking) => {
                  const { top, height, showService } = positionFor(booking);
                  const isDragging = drag?.booking.id === booking.id;
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onPointerDown={(event) => handlePointerDown(event, booking)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(booking);
                        }
                      }}
                      aria-label={`Lịch ${formatTime(booking.start_time)} của ${booking.customer?.name ?? 'khách'} — ${STATUS_LABEL[booking.status]}. Nhấn Enter để mở chi tiết.`}
                      className={cn(
                        'absolute left-1 right-1 touch-none overflow-hidden rounded-control border px-2 py-1 text-left text-meta transition-shadow',
                        STATUS_BG[booking.status] ?? 'bg-surface border-border',
                        isDragging ? 'z-20 shadow-md' : 'hover:shadow-sm',
                      )}
                      style={{
                        top: top + (isDragging ? drag!.dy : 0),
                        height,
                        transform: isDragging ? `translateX(${drag!.dx}px)` : undefined,
                        cursor: 'grab',
                      }}
                    >
                      <span className="block font-medium text-ink tnum">{formatTime(booking.start_time)}</span>
                      <span className="block truncate text-ink">{booking.customer?.name ?? 'Khách'}</span>
                      {showService ? <span className="block truncate text-muted">{booking.service?.name}</span> : null}
                    </button>
                  );
                })}
            </div>
          ))}

          {stylists.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-4 text-body-sm text-muted">
              Chi nhánh chưa có stylist đang hoạt động.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-meta text-muted">
        <span>Trạng thái:</span>
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <Badge key={status} tone={STATUS_TONE[status]}>
            {label}
          </Badge>
        ))}
        <span className="ml-2">Kéo khối lịch để dời giờ/stylist · Bấm để mở chi tiết</span>
      </div>
    </div>
  );
}
