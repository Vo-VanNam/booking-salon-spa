"use client";

import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import type { Branch, Service, SlotResult, Stylist } from "@/lib/api";
import { formatVnDate, formatVnd } from "@/lib/format";
import { isEmail, isVnPhone, EMAIL_ERROR_MESSAGE, PHONE_ERROR_MESSAGE } from "@/lib/validate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";

export const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập tên"),
  phone: z.string().trim().superRefine((value, ctx) => {
    if (!isVnPhone(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_ERROR_MESSAGE });
    }
  }),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isEmail(value), EMAIL_ERROR_MESSAGE),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự"),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

export interface SlotsState {
  loading: boolean;
  error: string | null;
  data: SlotResult | null;
}

export interface DateOption {
  key: string; // yyyy-MM-dd
  headline: string;
  dayMonth: string;
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function SelectCard({
  onClick,
  title,
  subtitle,
  extra,
}: {
  onClick: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <p className="font-semibold">{title}</p>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      {extra && <div className="mt-1.5 text-sm">{extra}</div>}
    </button>
  );
}

// Bước 1: Chọn chi nhánh
export function BranchStep({
  branches,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  branches: Branch[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (branch: Branch) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Chọn chi nhánh</h2>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <LoadError error={error} onRetry={onRetry} />
      ) : branches.length === 0 ? (
        <EmptyState message="Hiện chưa có chi nhánh nào" />
      ) : (
        <div className="space-y-3">
          {branches.map((branch) => (
            <SelectCard
              key={branch.id}
              onClick={() => onSelect(branch)}
              title={branch.name}
              subtitle={branch.address}
              extra={
                <span className="text-muted-foreground">
                  Giờ mở cửa: {branch.openTime} – {branch.closeTime}
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Bước 2: Chọn dịch vụ
export function ServiceStep({
  services,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  services: Service[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (service: Service) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Chọn dịch vụ</h2>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <LoadError error={error} onRetry={onRetry} />
      ) : services.length === 0 ? (
        <EmptyState message="Chi nhánh này chưa có dịch vụ" />
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <SelectCard
              key={service.id}
              onClick={() => onSelect(service)}
              title={service.name}
              subtitle={service.description ?? undefined}
              extra={
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{service.durationMinutes} phút</span>
                  <span className="font-semibold text-primary">{formatVnd(service.price)}</span>
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Bước 3: Chọn stylist
export function StylistStep({
  stylists,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  stylists: Stylist[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (stylist: Stylist) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Chọn stylist</h2>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      ) : error ? (
        <LoadError error={error} onRetry={onRetry} />
      ) : stylists.length === 0 ? (
        <EmptyState message="Chi nhánh này chưa có stylist" />
      ) : (
        <div className="space-y-3">
          {stylists.map((stylist) => (
            <button
              key={stylist.id}
              type="button"
              onClick={() => onSelect(stylist)}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {stylist.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stylist.avatarUrl}
                  alt={stylist.name}
                  className="size-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                  {stylist.name.charAt(0)}
                </span>
              )}
              <span className="font-medium">{stylist.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Bước 4: Chọn ngày và giờ
export function DateTimeStep({
  dateOptions,
  selectedDate,
  selectedTime,
  slots,
  onSelectDate,
  onSelectTime,
  onRetrySlots,
  onNext,
}: {
  dateOptions: DateOption[];
  selectedDate: string | null;
  selectedTime: string | null;
  slots: SlotsState;
  onSelectDate: (date: string) => void;
  onSelectTime: (time: string) => void;
  onRetrySlots: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Chọn ngày và giờ</h2>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dateOptions.map((option) => {
          const selected = option.key === selectedDate;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelectDate(option.key)}
              className={cn(
                "flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/60",
              )}
            >
              <span className={cn("text-xs", selected ? "font-semibold" : "font-medium")}>
                {option.headline}
              </span>
              <span className="font-number text-sm font-semibold">{option.dayMonth}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Chọn giờ</p>
        {slots.loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : slots.error ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-destructive">{slots.error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetrySlots}>
              Thử lại
            </Button>
          </div>
        ) : slots.data?.reason ? (
          <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            {slots.data.reason}
          </p>
        ) : slots.data && slots.data.slots.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Không có khung giờ trống trong ngày này
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.data?.slots.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => onSelectTime(time)}
                className={cn(
                  "rounded-lg border py-2.5 font-number text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selectedTime === time
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/60",
                )}
              >
                {time}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full" disabled={!selectedDate || !selectedTime} onClick={onNext}>
        Tiếp tục
      </Button>
    </div>
  );
}

// Bước 5: Thông tin khách
export function CustomerInfoStep({
  form,
  onNext,
}: {
  form: UseFormReturn<CustomerFormValues>;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Thông tin khách</h2>
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onNext)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Họ tên</FormLabel>
                <FormControl>
                  <Input placeholder="Nhập họ và tên" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Số điện thoại</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="numeric" placeholder="VD: 0912345678" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Email <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                </FormLabel>
                <FormControl>
                  <Input type="email" placeholder="email@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Ghi chú <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                </FormLabel>
                <FormControl>
                  <textarea
                    rows={3}
                    placeholder="Ghi chú thêm cho salon (tối đa 500 ký tự)"
                    className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={!form.formState.isValid} className="w-full">
            Tiếp tục
          </Button>
        </form>
      </Form>
    </div>
  );
}

// Bước 6: Xác nhận
export function ConfirmStep({
  branch,
  service,
  stylist,
  selectedDate,
  selectedTime,
  note,
  needsLogin,
  loginPassword,
  loginError,
  loginLoading,
  submitting,
  onLoginPasswordChange,
  onLogin,
  onConfirm,
}: {
  branch: Branch;
  service: Service;
  stylist: Stylist;
  selectedDate: string;
  selectedTime: string;
  note: string;
  needsLogin: boolean;
  loginPassword: string;
  loginError: string | null;
  loginLoading: boolean;
  submitting: boolean;
  onLoginPasswordChange: (password: string) => void;
  onLogin: () => void;
  onConfirm: () => void;
}) {
  const trimmedNote = note.trim();
  const rows: { label: string; value: string; sub?: string }[] = [
    { label: "Chi nhánh", value: branch.name, sub: branch.address },
    {
      label: "Dịch vụ",
      value: service.name,
      sub: `${service.durationMinutes} phút · ${formatVnd(service.price)}`,
    },
    { label: "Stylist", value: stylist.name },
    {
      label: "Thời gian",
      value: `${formatVnDate(new Date(`${selectedDate}T00:00:00`))} ${selectedTime}`,
    },
    { label: "Tổng tiền", value: formatVnd(service.price) },
  ];
  if (trimmedNote) {
    rows.push({ label: "Ghi chú", value: trimmedNote });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Xác nhận đặt lịch</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-3 text-sm">
            <span className="shrink-0 text-muted-foreground">{row.label}</span>
            <span className="text-right">
              <span className="font-medium">{row.value}</span>
              {row.sub && <span className="block text-xs text-muted-foreground">{row.sub}</span>}
            </span>
          </div>
        ))}
      </div>

      {needsLogin && (
        <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
          <p className="text-sm">
            Số điện thoại này đã được đăng ký. Vui lòng nhập mật khẩu để đăng nhập.
          </p>
          <Input
            type="password"
            placeholder="Mật khẩu"
            autoComplete="current-password"
            value={loginPassword}
            onChange={(e) => onLoginPasswordChange(e.target.value)}
          />
          {loginError && <p className="text-sm text-destructive">{loginError}</p>}
          <Button
            variant="outline"
            className="w-full"
            onClick={onLogin}
            disabled={loginLoading || !loginPassword}
          >
            {loginLoading && <Loader2 className="animate-spin" />}
            Đăng nhập
          </Button>
        </div>
      )}

      <Button className="w-full" onClick={onConfirm} disabled={submitting || needsLogin}>
        {submitting && <Loader2 className="animate-spin" />}
        Xác nhận đặt lịch
      </Button>
    </div>
  );
}
