"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarOff, Clock, Pencil, Plus, Trash2, UserX } from "lucide-react";

import { useAuth } from "@/components/auth/route-guard";
import { BranchFilter } from "@/components/admin/branch-filter";
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type AdminStylist,
  type TimeOff,
} from "@/lib/api";
import { formatVnDate, formatVnTime, vnToUtcIso } from "@/lib/format";
import { isVnPhone, PHONE_ERROR_MESSAGE } from "@/lib/validate";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DAY_NAMES = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

const stylistSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên stylist").max(100, "Tên tối đa 100 ký tự"),
  phone: z.string().trim().refine(isVnPhone, PHONE_ERROR_MESSAGE),
  email: z
    .string()
    .trim()
    .max(255, "Email tối đa 255 ký tự")
    .optional()
    .transform((value) => (value ? value : undefined)),
  avatarUrl: z
    .string()
    .trim()
    .max(500, "Link ảnh tối đa 500 ký tự")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

type StylistValues = z.infer<typeof stylistSchema>;

function hoursSummary(stylist: AdminStylist): string {
  if (stylist.workingHours.length === 0) return "Không có giờ làm";
  const byDay = new Map(stylist.workingHours.map((h) => [h.dayOfWeek, h]));
  const groups: string[] = [];
  const formatRange = (d: number) => {
    const h = byDay.get(d)!;
    return `${h.startTime}-${h.endTime}`;
  };
  let i = 1;
  while (i <= 6) {
    if (byDay.has(i)) {
      let j = i;
      while (j + 1 <= 6 && byDay.has(j + 1)) j += 1;
      groups.push(
        i === j
          ? `T${i + 1} ${formatRange(i)}`
          : `T${i + 1}-T${j + 1} ${formatRange(i)}`,
      );
      i = j + 1;
    } else {
      i += 1;
    }
  }
  if (byDay.has(0)) groups.push(`CN ${formatRange(0)}`);
  return groups.join(", ");
}

function StylistFormDialog({
  stylist,
  branchId,
  onClose,
  onSaved,
}: {
  stylist: AdminStylist | null;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(stylist?.active ?? true);

  const form = useForm<StylistValues>({
    resolver: zodResolver(stylistSchema),
    defaultValues: {
      name: stylist?.name ?? "",
      phone: stylist?.phone ?? "",
      email: stylist?.email ?? "",
      avatarUrl: stylist?.avatarUrl ?? "",
    },
  });

  async function onSubmit(values: StylistValues) {
    setSaving(true);
    try {
      if (stylist) {
        await apiPatch(`/admin/stylists/${stylist.id}`, { ...values, active });
        toast.success("Đã cập nhật stylist");
      } else {
        await apiPost("/admin/stylists", { ...values, branchId });
        toast.success("Đã thêm stylist");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stylist ? "Sửa stylist" : "Thêm stylist"}</DialogTitle>
          <DialogDescription>
            {stylist ? "Cập nhật thông tin stylist" : "Tạo stylist mới cho chi nhánh"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Họ tên</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Nguyễn Văn Hùng" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Số điện thoại</FormLabel>
                    <FormControl>
                      <Input placeholder="VD: 0901234001" inputMode="tel" {...field} />
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="VD: hung@salonglow.vn" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link ảnh đại diện (không bắt buộc)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {stylist ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Đang hoạt động
              </label>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : stylist ? "Lưu thay đổi" : "Thêm stylist"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface HourRow {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

function WorkingHoursDialog({
  stylist,
  onClose,
  onSaved,
}: {
  stylist: AdminStylist;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<HourRow[]>(() =>
    DAY_NAMES.map((_, day) => {
      const existing = stylist.workingHours.find((h) => h.dayOfWeek === day);
      return {
        dayOfWeek: day,
        enabled: existing !== undefined,
        startTime: existing?.startTime ?? "09:00",
        endTime: existing?.endTime ?? "21:00",
      };
    }),
  );
  const [saving, setSaving] = useState(false);

  function updateRow(day: number, patch: Partial<HourRow>) {
    setRows((prev) => prev.map((row) => (row.dayOfWeek === day ? { ...row, ...patch } : row)));
  }

  async function save() {
    const enabled = rows.filter((row) => row.enabled);
    const invalid = enabled.find((row) => row.startTime >= row.endTime);
    if (invalid) {
      toast.error(`${DAY_NAMES[invalid.dayOfWeek]}: giờ bắt đầu phải trước giờ kết thúc`);
      return;
    }
    setSaving(true);
    try {
      await apiPut(`/admin/stylists/${stylist.id}/working-hours`, {
        workingHours: enabled.map(({ dayOfWeek, startTime, endTime }) => ({
          dayOfWeek,
          startTime,
          endTime,
        })),
      });
      toast.success("Đã lưu giờ làm việc");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Giờ làm việc — {stylist.name}</DialogTitle>
          <DialogDescription>
            Đánh dấu những ngày làm việc và chọn khung giờ (theo giờ Việt Nam)
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.dayOfWeek}
              className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border p-2 ${
                row.enabled ? "border-border bg-card" : "border-dashed bg-muted/50 opacity-60"
              }`}
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(row.dayOfWeek, { enabled: e.target.checked })}
                  className="size-4 accent-primary"
                />
                {DAY_NAMES[row.dayOfWeek]}
              </label>
              <div className="flex items-center gap-1.5 font-number">
                <Input
                  type="time"
                  className="h-8 w-28"
                  value={row.startTime}
                  disabled={!row.enabled}
                  onChange={(e) => updateRow(row.dayOfWeek, { startTime: e.target.value })}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  className="h-8 w-28"
                  value={row.endTime}
                  disabled={!row.enabled}
                  onChange={(e) => updateRow(row.dayOfWeek, { endTime: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu giờ làm việc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeOffDialog({
  stylist,
  onClose,
  onSaved,
}: {
  stylist: AdminStylist;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function addTimeOff() {
    if (!date) {
      toast.error("Vui lòng chọn ngày nghỉ");
      return;
    }
    if (startTime >= endTime) {
      toast.error("Giờ bắt đầu phải trước giờ kết thúc");
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/admin/stylists/${stylist.id}/time-off`, {
        startTime: vnToUtcIso(date, startTime),
        endTime: vnToUtcIso(date, endTime),
        reason: reason || undefined,
      });
      toast.success("Đã thêm ngày nghỉ");
      setDate("");
      setReason("");
      onSaved();
    } catch (e) {
      // 409: trùng lịch hẹn hiện có — hiển thị đúng message tiếng Việt.
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTimeOff(timeOff: TimeOff) {
    setDeletingId(timeOff.id);
    try {
      await apiDelete(`/admin/stylists/${stylist.id}/time-off/${timeOff.id}`);
      toast.success("Đã xóa ngày nghỉ");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nghỉ phép — {stylist.name}</DialogTitle>
          <DialogDescription>
            Thêm ngày nghỉ để khách không đặt được lịch trong khoảng thời gian này
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Ngày</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lý do (không bắt buộc)</Label>
              <Input
                placeholder="VD: Khám bệnh"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Từ</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <span className="pb-2 text-muted-foreground">–</span>
            <div className="flex flex-col gap-1.5">
              <Label>Đến</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <Button className="ml-auto" onClick={addTimeOff} disabled={saving}>
              <Plus />
              {saving ? "Đang thêm..." : "Thêm"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex max-h-64 flex-col gap-2 overflow-auto">
          {stylist.timeOffs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Chưa có ngày nghỉ nào</p>
          ) : (
            stylist.timeOffs.map((timeOff) => (
              <div
                key={timeOff.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {formatVnDate(timeOff.startTime)} · {formatVnTime(timeOff.startTime)} –{" "}
                    {formatVnTime(timeOff.endTime)}
                  </p>
                  {timeOff.reason ? (
                    <p className="text-xs text-muted-foreground">{timeOff.reason}</p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  aria-label="Xóa ngày nghỉ"
                  onClick={() => deleteTimeOff(timeOff)}
                  disabled={deletingId === timeOff.id}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StylistsManager() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const [branchId, setBranchId] = useState("");
  const branchReady = isSuper ? branchId !== "" : true;
  const effectiveBranchId = isSuper ? branchId : (user?.branchId ?? "");

  const [stylists, setStylists] = useState<AdminStylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStylist | null>(null);
  const [hoursTarget, setHoursTarget] = useState<AdminStylist | null>(null);
  const [timeOffTarget, setTimeOffTarget] = useState<AdminStylist | null>(null);
  const [deactivating, setDeactivating] = useState<AdminStylist | null>(null);
  const [deactivatingNow, setDeactivatingNow] = useState(false);

  useEffect(() => {
    if (!branchReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<AdminStylist[]>(`/admin/stylists${isSuper ? `?branchId=${branchId}` : ""}`)
      .then((data) => {
        if (!cancelled) setStylists(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchReady, isSuper, branchId, reloadKey]);

  const summary = useMemo(
    () => ({
      total: stylists.length,
      active: stylists.filter((s) => s.active).length,
    }),
    [stylists],
  );

  async function confirmDeactivate() {
    if (!deactivating) return;
    setDeactivatingNow(true);
    try {
      await apiPatch(`/admin/stylists/${deactivating.id}`, { active: false });
      toast.success("Đã vô hiệu hóa stylist");
      setDeactivating(null);
      setReloadKey((key) => key + 1);
    } catch (e) {
      // 409 khi còn lịch hẹn chưa hoàn thành.
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setDeactivatingNow(false);
    }
  }

  if (!branchReady) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Stylist</h1>
          <BranchFilter value={branchId} onChange={setBranchId} />
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Vui lòng chọn chi nhánh để quản lý stylist
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Stylist
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {summary.active}/{summary.total} đang hoạt động
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFilter value={branchId} onChange={setBranchId} />
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Thêm stylist
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            Thử lại
          </Button>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Giờ làm việc</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stylists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Chưa có stylist nào
                  </TableCell>
                </TableRow>
              ) : (
                stylists.map((stylist) => (
                  <TableRow key={stylist.id}>
                    <TableCell className="font-medium">{stylist.name}</TableCell>
                    <TableCell className="font-number">{stylist.phone}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {hoursSummary(stylist)}
                    </TableCell>
                    <TableCell>
                      {stylist.active ? (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800">
                          Hoạt động
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Đã vô hiệu hóa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Sửa stylist ${stylist.name}`}
                          onClick={() => {
                            setEditing(stylist);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Giờ làm việc của ${stylist.name}`}
                          onClick={() => setHoursTarget(stylist)}
                        >
                          <Clock />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Nghỉ phép của ${stylist.name}`}
                          onClick={() => setTimeOffTarget(stylist)}
                        >
                          <CalendarOff />
                        </Button>
                        {stylist.active ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Vô hiệu hóa ${stylist.name}`}
                            onClick={() => setDeactivating(stylist)}
                          >
                            <UserX />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen ? (
        <StylistFormDialog
          stylist={editing}
          branchId={effectiveBranchId}
          onClose={() => setFormOpen(false)}
          onSaved={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      {hoursTarget ? (
        <WorkingHoursDialog
          stylist={hoursTarget}
          onClose={() => setHoursTarget(null)}
          onSaved={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      {timeOffTarget ? (
        <TimeOffDialog
          stylist={timeOffTarget}
          onClose={() => setTimeOffTarget(null)}
          onSaved={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      <Dialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vô hiệu hóa stylist</DialogTitle>
            <DialogDescription>
              Vô hiệu hóa “{deactivating?.name}”? Stylist sẽ không nhận lịch hẹn
              mới nữa nhưng lịch sử vẫn được giữ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivating(null)}
              disabled={deactivatingNow}
            >
              Quay lại
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeactivate}
              disabled={deactivatingNow}
            >
              {deactivatingNow ? "Đang xử lý..." : "Vô hiệu hóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
