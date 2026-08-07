"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { CalendarOff, ChevronLeft, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import { RouteGuard } from "@/components/auth/route-guard";
import { StatusBadge } from "@/components/admin/booking-status";
import {
  ApiError,
  apiGet,
  type StylistBooking,
  type StylistMe,
} from "@/lib/api";
import { formatVnDate, formatVnTime, formatVnd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

function StylistSchedule() {
  const { user } = useAuth();
  const [me, setMe] = useState<StylistMe | null>(null);
  const [bookings, setBookings] = useState<StylistBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<StylistBooking | null>(null);

  const weekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    [],
  );
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return {
          key: format(date, "yyyy-MM-dd"),
          label: i === 0 ? "T2" : `T${i + 1}`,
          day: format(date, "dd"),
          isToday: isSameDay(date, new Date()),
        };
      }),
    [weekStart],
  );

  useEffect(() => {
    let cancelled = false;
    apiGet<StylistMe>("/stylist/me")
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");
    apiGet<StylistBooking[]>(`/stylist/me/bookings?from=${from}&to=${to}`)
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, reloadKey]);

  const dayBookings = useMemo(
    () => bookings.filter((b) => format(b.startTime, "yyyy-MM-dd") === selectedDate),
    [bookings, selectedDate],
  );

  const nextUpcoming = useMemo(() => {
    const now = new Date();
    return dayBookings.find(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        new Date(b.startTime) >= now,
    );
  }, [dayBookings]);

  const dayTimeOff = useMemo(() => {
    if (!me) return null;
    const date = new Date(`${selectedDate}T00:00:00`);
    return (
      me.timeOffs.find((t) => {
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        return (
          (isSameDay(start, date) || start <= date) &&
          (isSameDay(end, date) || end > date)
        );
      }) ?? null
    );
  }, [me, selectedDate]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold"
          aria-label="Salon Glow — Trang chủ"
        >
          <Sparkles className="size-5 text-primary" />
          <span>Salon Glow</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Quay lại trang chủ"
        >
          <ChevronLeft className="size-3.5" />
          Trang chủ
        </Link>
      </header>

      <div>
        <h1 className="text-xl font-semibold">
          {user?.name ? `Xin chào, ${user.name}` : "Xin chào"}
        </h1>
        {me?.branch ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {me.branch.name} · {me.branch.openTime} – {me.branch.closeTime}
          </p>
        ) : null}
      </div>

      {/* Chuyển ngày trong tuần */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => {
          const active = day.key === selectedDate;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedDate(day.key)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl border py-2 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              <span className="text-xs">{day.label}</span>
              <span className="font-number font-semibold">{day.day}</span>
              {day.isToday ? (
                <span className={cn("text-[10px]", active ? "text-primary-foreground" : "text-primary")}>
                  Nay
                </span>
              ) : (
                <span className="text-[10px] opacity-0">·</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Nghỉ phép trong ngày */}
      {dayTimeOff ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <CalendarOff className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Bạn đang nghỉ phép ngày này</p>
            <p className="text-xs">
              {formatVnTime(dayTimeOff.startTime)} – {formatVnTime(dayTimeOff.endTime)}
              {dayTimeOff.reason ? ` · ${dayTimeOff.reason}` : ""}
            </p>
          </div>
        </div>
      ) : null}

      {/* Lịch hẹn kế tiếp hôm nay */}
      {selectedDate === format(new Date(), "yyyy-MM-dd") && nextUpcoming ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Lịch hẹn tiếp theo
          </p>
          <p className="mt-1 font-number text-lg font-semibold">
            {formatVnTime(nextUpcoming.startTime)} – {formatVnTime(nextUpcoming.endTime)}
          </p>
          <p className="text-sm">
            {nextUpcoming.customer.name} · {nextUpcoming.service.name}
          </p>
        </div>
      ) : null}

      <Separator />

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {selectedDate === format(new Date(), "yyyy-MM-dd")
            ? "Hôm nay"
            : formatVnDate(selectedDate)}
        </h2>
        <span className="text-sm text-muted-foreground">
          {dayBookings.length} lịch hẹn
        </span>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            Thử lại
          </Button>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : dayBookings.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted px-6 py-10 text-center text-sm text-muted-foreground">
          Không có lịch hẹn trong ngày này
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {dayBookings.map((booking) => {
            const done =
              booking.status === "completed" ||
              booking.status === "cancelled" ||
              booking.status === "no_show";
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => setDetail(booking)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent",
                  done && "opacity-60",
                )}
              >
                <div className="w-14 shrink-0 text-center">
                  <p className="font-number text-sm font-semibold">
                    {formatVnTime(booking.startTime)}
                  </p>
                  <p className="font-number text-xs text-muted-foreground">
                    {formatVnTime(booking.endTime)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {booking.customer.name} · {booking.service.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {booking.customer.phone} · {booking.service.durationMinutes} phút
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={booking.status} />
                  <span className="font-number text-xs text-muted-foreground">
                    {formatVnd(booking.service.price)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Chi tiết lịch hẹn (chỉ xem) */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Chi tiết lịch hẹn</DialogTitle>
            <DialogDescription>
              {detail ? `${formatVnDate(detail.startTime)} · ${formatVnTime(detail.startTime)} – ${formatVnTime(detail.endTime)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <StatusBadge status={detail.status} />
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">{detail.customer.name}</p>
                <p className="font-number text-muted-foreground">{detail.customer.phone}</p>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <span className="text-muted-foreground">Dịch vụ</span>
                <span>
                  {detail.service.name} ({detail.service.durationMinutes} phút)
                </span>
                <span className="text-muted-foreground">Giá dịch vụ</span>
                <span className="font-number">{formatVnd(detail.service.price)}</span>
              </div>
              {detail.note ? (
                <p className="rounded-lg border border-border p-3 text-muted-foreground">
                  Ghi chú: {detail.note}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ScheduleView() {
  return (
    <RouteGuard allowedRoles={["stylist"]}>
      <StylistSchedule />
    </RouteGuard>
  );
}
