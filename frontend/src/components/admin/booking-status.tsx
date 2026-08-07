import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const BOOKING_STATUS_META: Record<
  string,
  { label: string; color: string; badgeClass: string }
> = {
  pending: {
    label: "Chờ xác nhận",
    color: "#D9A441",
    badgeClass: "bg-amber-100 text-amber-900",
  },
  confirmed: {
    label: "Đã xác nhận",
    color: "#8B6F47",
    badgeClass: "bg-primary/10 text-primary",
  },
  completed: {
    label: "Hoàn thành",
    color: "#4A7C59",
    badgeClass: "bg-emerald-100 text-emerald-800",
  },
  cancelled: {
    label: "Đã hủy",
    color: "#A8A29E",
    badgeClass: "bg-muted text-muted-foreground",
  },
  no_show: {
    label: "Vắng mặt",
    color: "#B3261E",
    badgeClass: "bg-destructive/10 text-destructive",
  },
};

export function bookingStatusMeta(status: string) {
  return (
    BOOKING_STATUS_META[status] ?? {
      label: status,
      color: "#8B6F47",
      badgeClass: "bg-muted text-muted-foreground",
    }
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = bookingStatusMeta(status);
  return (
    <Badge variant="outline" className={cn(meta.badgeClass, className)}>
      {meta.label}
    </Badge>
  );
}

export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  none: "Không cọc",
  pending: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn cọc",
  failed: "Thanh toán thất bại",
};

export function depositStatusLabel(status: string): string {
  return DEPOSIT_STATUS_LABELS[status] ?? status;
}
