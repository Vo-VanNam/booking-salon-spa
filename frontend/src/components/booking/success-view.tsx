"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { BookingResponse, Branch, DepositResponse, Service, Stylist } from "@/lib/api";
import { apiPost, ApiError } from "@/lib/api";
import { formatVnDate, formatVnTime, formatVnd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR } from "./booking-steps";

const PAYMENT_NOT_CONFIGURED_MESSAGE =
  "Chưa cấu hình thanh toán trực tuyến, vui lòng liên hệ salon để đặt cọc";

function SummaryRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="font-medium">{value}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

export function SuccessView({
  booking,
  branch,
  service,
  stylist,
  autoRegistered,
}: {
  booking: BookingResponse;
  branch: Branch;
  service: Service;
  stylist: Stylist;
  autoRegistered: { phone: string; password: string } | null;
}) {
  const router = useRouter();
  const [depositing, setDepositing] = useState(false);

  const shortId = booking.id.slice(0, 8).toUpperCase();

  async function handleDeposit() {
    if (depositing) return;
    setDepositing(true);
    try {
      const res = await apiPost<DepositResponse>(`/bookings/${booking.id}/deposit`, {
        provider: "vnpay",
      });
      if (res.paymentUrl) {
        window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      if (e instanceof ApiError && (e.statusCode === 503 || e.statusCode === 404)) {
        toast.info(PAYMENT_NOT_CONFIGURED_MESSAGE);
      } else {
        toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      }
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <CheckCircle2 className="mx-auto size-12 text-green-600" />
      <h1 className="mt-4 text-center text-xl font-bold">Đặt lịch thành công!</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Mã đặt lịch:{" "}
        <span className="font-number font-semibold text-foreground">{shortId}</span>
      </p>

      <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
        <SummaryRow label="Chi nhánh" value={branch.name} sub={branch.address} />
        <SummaryRow label="Dịch vụ" value={service.name} sub={`${service.durationMinutes} phút`} />
        <SummaryRow label="Stylist" value={stylist.name} />
        <SummaryRow
          label="Thời gian"
          value={`${formatVnDate(booking.startTime)} ${formatVnTime(booking.startTime)}`}
        />
        <SummaryRow label="Tổng tiền" value={formatVnd(booking.priceAtBooking)} />
        {booking.discountAmount > 0 && (
          <SummaryRow label="Giảm giá" value={`-${formatVnd(booking.discountAmount)}`} />
        )}
        {booking.depositAmount > 0 && (
          <SummaryRow label="Đặt cọc" value={formatVnd(booking.depositAmount)} />
        )}
      </div>

      {autoRegistered && (
        <div className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Tài khoản đã được tạo tự động:{" "}
          <span className="font-medium text-foreground">{autoRegistered.phone}</span> / Mật khẩu:{" "}
          <span className="font-number font-medium text-foreground">{autoRegistered.password}</span>
          . Vui lòng lưu lại để đăng nhập lần sau.
        </div>
      )}

      <div className="mt-6 space-y-3">
        <Button className="w-full" onClick={handleDeposit} disabled={depositing}>
          {depositing && <Loader2 className="animate-spin" />}
          Thanh toán cọc
        </Button>
        <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
          Về trang chủ
        </Button>
      </div>
    </div>
  );
}
