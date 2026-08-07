"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  StatusBadge,
  bookingStatusMeta,
  depositStatusLabel,
} from "@/components/admin/booking-status";
import { ApiError, apiPatch, type CalendarBooking } from "@/lib/api";
import { formatVnDate, formatVnTime, formatVnd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Chi tiết lịch hẹn + đổi trạng thái. Backend chỉ cho phép:
 * cancelled (từ pending/confirmed), no_show và completed (từ confirmed,
 * completed chỉ khi lịch đã kết thúc) — UI hiển thị đúng các lựa chọn đó.
 */
export function BookingDetailDialog({
  booking,
  onClose,
  onChanged,
}: {
  booking: CalendarBooking | null;
  onClose: () => void;
  onChanged: (updated: Partial<CalendarBooking>) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setSelectedStatus("");
    setSaving(false);
    setConfirmCancel(false);
  }, [booking?.id]);

  const allowedStatuses = useMemo(() => {
    if (!booking) return [];
    const options: { value: string; label: string }[] = [];
    if (booking.status === "pending" || booking.status === "confirmed") {
      options.push({ value: "cancelled", label: bookingStatusMeta("cancelled").label });
    }
    if (booking.status === "confirmed") {
      options.push({ value: "no_show", label: bookingStatusMeta("no_show").label });
      if (new Date(booking.endTime) <= new Date()) {
        options.push({ value: "completed", label: bookingStatusMeta("completed").label });
      }
    }
    return options;
  }, [booking]);

  async function applyStatus(status: string) {
    if (!booking || saving) return;
    setSaving(true);
    try {
      await apiPatch(`/admin/bookings/${booking.id}/status`, { status });
      toast.success(`Đã chuyển sang "${bookingStatusMeta(status).label}"`);
      onChanged({ status });
      setSelectedStatus("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Không thể đổi trạng thái");
    } finally {
      setSaving(false);
    }
  }

  if (!booking) return null;

  const discount = booking.priceAtBooking - booking.discountAmount;

  return (
    <>
      <Dialog open={booking !== null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chi tiết lịch hẹn</DialogTitle>
            <DialogDescription>
              {formatVnDate(booking.startTime)} · {formatVnTime(booking.startTime)} –{" "}
              {formatVnTime(booking.endTime)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={booking.status} />
              {booking.depositAmount > 0 ? (
                <Badge variant="outline">
                  Cọc {formatVnd(booking.depositAmount)} · {depositStatusLabel(booking.depositStatus)}
                </Badge>
              ) : null}
            </div>

            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">{booking.customer.name}</p>
              <p className="font-number text-muted-foreground">{booking.customer.phone}</p>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <span className="text-muted-foreground">Dịch vụ</span>
              <span>
                {booking.service.name} ({booking.service.durationMinutes} phút)
              </span>
              <span className="text-muted-foreground">Stylist</span>
              <span>{booking.stylist.name}</span>
              <span className="text-muted-foreground">Giá dịch vụ</span>
              <span className="font-number">{formatVnd(booking.priceAtBooking)}</span>
              {booking.discountAmount > 0 ? (
                <>
                  <span className="text-muted-foreground">Giảm giá</span>
                  <span className="font-number text-emerald-700">
                    -{formatVnd(booking.discountAmount)}
                  </span>
                </>
              ) : null}
              <span className="text-muted-foreground">Khách phải trả</span>
              <span className="font-number font-medium">{formatVnd(discount)}</span>
            </div>

            {booking.note ? (
              <p className="rounded-lg border border-border p-3 text-muted-foreground">
                Ghi chú: {booking.note}
              </p>
            ) : null}

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Đổi trạng thái
              </p>
              {allowedStatuses.length > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={selectedStatus || undefined} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Chọn trạng thái mới" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedStatuses.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => selectedStatus && applyStatus(selectedStatus)}
                    disabled={!selectedStatus || saving}
                  >
                    Lưu trạng thái
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Không thể đổi trạng thái từ trạng thái hiện tại
                </p>
              )}
              {booking.status === "pending" || booking.status === "confirmed" ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="self-start"
                  onClick={() => setConfirmCancel(true)}
                  disabled={saving}
                >
                  Hủy lịch hẹn
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Xác nhận hủy lịch hẹn */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Xác nhận hủy lịch hẹn</DialogTitle>
            <DialogDescription>
              Hủy lịch của {booking.customer.name} lúc {formatVnTime(booking.startTime)}{" "}
              {formatVnDate(booking.startTime)}? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={saving}>
              Quay lại
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmCancel(false);
                void applyStatus("cancelled");
              }}
              disabled={saving}
            >
              {saving ? "Đang hủy..." : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
