"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import viLocale from "@fullcalendar/core/locales/vi";
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/route-guard";
import { BranchFilter } from "@/components/admin/branch-filter";
import { bookingStatusMeta } from "@/components/admin/booking-status";
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog";
import {
  ApiError,
  apiGet,
  apiPatch,
  type AdminStylist,
  type CalendarBooking,
  type CalendarResponse,
} from "@/lib/api";
import { formatVnDate, formatVnTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface MoveTarget {
  booking: CalendarBooking;
  newStart: Date;
  oldStart: Date;
}

function toEvents(bookings: CalendarBooking[]): EventInput[] {
  return bookings.map((b) => {
    const meta = bookingStatusMeta(b.status);
    return {
      id: b.id,
      title: `${b.customer.name} - ${b.service.name}`,
      start: b.startTime,
      end: b.endTime,
      backgroundColor: meta.color,
      borderColor: meta.color,
      textColor: "#FFFFFF",
      classNames: [`fc-booking-${b.status}`],
      extendedProps: { booking: b },
    };
  });
}

export function CalendarView() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const [branchId, setBranchId] = useState("");
  const [stylistId, setStylistId] = useState("");
  const [stylists, setStylists] = useState<AdminStylist[]>([]);

  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    return { from: format(weekStart, "yyyy-MM-dd"), to: format(weekEnd, "yyyy-MM-dd") };
  });
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moving, setMoving] = useState(false);
  const [detailBooking, setDetailBooking] = useState<CalendarBooking | null>(null);

  const branchReady = isSuper ? branchId !== "" : true;

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Danh sách stylist để lọc lịch theo stylist.
  useEffect(() => {
    if (!branchReady) return;
    let cancelled = false;
    apiGet<AdminStylist[]>(
      `/admin/stylists${isSuper ? `?branchId=${branchId}` : ""}`,
    )
      .then((data) => {
        if (!cancelled) setStylists(data);
      })
      .catch(() => {
        if (!cancelled) setStylists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchReady, isSuper, branchId]);

  useEffect(() => {
    if (!branchReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (isSuper) params.set("branchId", branchId);
    if (stylistId) params.set("stylistId", stylistId);
    apiGet<CalendarResponse>(`/admin/calendar?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setBookings(data.bookings);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof ApiError ? e.message : "Không tải được lịch hẹn, vui lòng thử lại",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchReady, isSuper, branchId, stylistId, range, reloadKey]);

  const events = useMemo(() => toEvents(bookings), [bookings]);

  function handleDatesSet(arg: DatesSetArg) {
    const from = format(arg.start, "yyyy-MM-dd");
    const to = format(addDays(arg.end, -1), "yyyy-MM-dd");
    setRange((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  }

  async function handleEventDrop(info: EventDropArg) {
    const booking = info.event.extendedProps.booking as CalendarBooking;
    const newStart = info.event.start;
    const oldStart = info.oldEvent.start;
    if (!newStart || !oldStart || newStart.getTime() === oldStart.getTime()) {
      info.revert();
      return;
    }
    setMoveTarget({ booking, newStart, oldStart });
  }

  async function confirmMove() {
    if (!moveTarget) return;
    setMoving(true);
    try {
      await apiPatch(`/admin/bookings/${moveTarget.booking.id}/move`, {
        startTime: moveTarget.newStart.toISOString(),
      });
      toast.success("Đã dời lịch hẹn");
      setMoveTarget(null);
      reload();
    } catch (e) {
      // Xung đột slot (409) hoặc lỗi khác: báo tiếng Việt và tải lại dữ liệu
      // thật từ server để đồng bộ lịch.
      toast.error(
        e instanceof ApiError ? e.message : "Không thể dời lịch hẹn, vui lòng thử lại",
      );
      setMoveTarget(null);
      reload();
    } finally {
      setMoving(false);
    }
  }

  if (!branchReady) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Lịch hẹn</h1>
          <BranchFilter value={branchId} onChange={setBranchId} />
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Vui lòng chọn chi nhánh để xem lịch hẹn
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Lịch hẹn</h1>
        <div className="flex flex-wrap items-center gap-2">
          {stylists.length > 0 ? (
            <div className="w-full sm:w-48">
              <Select value={stylistId || undefined} onValueChange={(v) => setStylistId(v === "all" ? "" : v)}>
                <SelectTrigger aria-label="Lọc theo stylist">
                  <SelectValue placeholder="Tất cả stylist" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả stylist</SelectItem>
                  {stylists.map((stylist) => (
                    <SelectItem key={stylist.id} value={stylist.id}>
                      {stylist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <BranchFilter value={branchId} onChange={setBranchId} />
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={reload}>
            Thử lại
          </Button>
        </div>
      ) : loading && bookings.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-2 sm:p-4">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={viLocale}
            firstDay={1}
            height="auto"
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:15:00"
            nowIndicator
            events={events}
            editable
            eventDurationEditable={false}
            eventStartEditable
            datesSet={handleDatesSet}
            eventDrop={handleEventDrop}
            eventClick={(info: EventClickArg) => {
              const booking = info.event.extendedProps.booking as CalendarBooking;
              setDetailBooking(booking);
            }}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridWeek,dayGridMonth",
            }}
            buttonText={{
              today: "Hôm nay",
              week: "Tuần",
              month: "Tháng",
            }}
            eventContent={(arg) => (
              <div className="fc-custom-event">
                <div className="fc-custom-time">
                  {arg.event.start ? formatVnTime(arg.event.start) : ""}
                </div>
                <div className="fc-custom-title">{arg.event.title}</div>
              </div>
            )}
          />
        </div>
      )}

      {/* Xác nhận dời lịch bằng kéo thả */}
      <Dialog open={moveTarget !== null} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận dời lịch hẹn</DialogTitle>
            <DialogDescription>
              {moveTarget
                ? `Dời lịch của ${moveTarget.booking.customer.name} (${moveTarget.booking.service.name}) từ ${formatVnDate(moveTarget.oldStart)} ${formatVnTime(moveTarget.oldStart)} đến ${formatVnDate(moveTarget.newStart)} ${formatVnTime(moveTarget.newStart)}?`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)} disabled={moving}>
              Hủy
            </Button>
            <Button onClick={confirmMove} disabled={moving}>
              {moving ? "Đang dời..." : "Xác nhận dời"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BookingDetailDialog
        booking={detailBooking}
        onClose={() => setDetailBooking(null)}
        onChanged={(updated) => {
          setBookings((prev) =>
            prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)),
          );
          setDetailBooking((current) =>
            current && current.id === updated.id ? { ...current, ...updated } : current,
          );
        }}
      />
    </div>
  );
}
