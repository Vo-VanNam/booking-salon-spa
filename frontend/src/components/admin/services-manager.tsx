"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/route-guard";
import { BranchFilter } from "@/components/admin/branch-filter";
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type AdminService,
} from "@/lib/api";
import { formatVnd } from "@/lib/format";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const serviceSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên dịch vụ").max(100, "Tên dịch vụ tối đa 100 ký tự"),
  description: z
    .string()
    .trim()
    .max(1000, "Mô tả tối đa 1000 ký tự")
    .optional()
    .transform((value) => (value ? value : undefined)),
  price: z.coerce
    .number({ message: "Giá không hợp lệ" })
    .int("Giá phải là số nguyên")
    .min(1000, "Giá tối thiểu 1.000đ")
    .max(50_000_000, "Giá tối đa 50.000.000đ"),
  durationMinutes: z.coerce
    .number({ message: "Thời lượng không hợp lệ" })
    .int("Thời lượng phải là số nguyên")
    .min(5, "Thời lượng 5-480 phút")
    .max(480, "Thời lượng 5-480 phút"),
});

type ServiceValues = z.infer<typeof serviceSchema>;

const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

function ServiceFormDialog({
  service,
  branchId,
  onClose,
  onSaved,
}: {
  service: AdminService | null;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const form = useForm<ServiceValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name ?? "",
      description: service?.description ?? "",
      price: service?.price ?? 150000,
      durationMinutes: service?.durationMinutes ?? 60,
    },
  });

  async function onSubmit(values: ServiceValues) {
    setSaving(true);
    try {
      if (service) {
        await apiPatch(`/admin/services/${service.id}`, {
          name: values.name,
          description: values.description,
          price: values.price,
          durationMinutes: values.durationMinutes,
        });
        toast.success("Đã cập nhật dịch vụ");
      } else {
        await apiPost("/admin/services", { ...values, branchId });
        toast.success("Đã thêm dịch vụ");
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
          <DialogTitle>{service ? "Sửa dịch vụ" : "Thêm dịch vụ"}</DialogTitle>
          <DialogDescription>
            Giá nhập theo đơn vị đồng (VND), thời lượng tính bằng phút
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên dịch vụ</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Cắt tóc nam" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mô tả (không bắt buộc)</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Gội, cắt và tạo kiểu" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giá (đ)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1000} step={1000} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thời lượng (phút)</FormLabel>
                    <FormControl>
                      <Input type="number" min={5} max={480} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : service ? "Lưu thay đổi" : "Thêm dịch vụ"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function ServicesManager() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const [branchId, setBranchId] = useState("");
  const branchReady = isSuper ? branchId !== "" : true;
  // branch_admin luôn thao tác trên chi nhánh của mình; super chọn trên UI.
  const effectiveBranchId = isSuper ? branchId : (user?.branchId ?? "");

  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminService | null>(null);
  const [deleting, setDeleting] = useState<AdminService | null>(null);
  const [deletingNow, setDeletingNow] = useState(false);

  useEffect(() => {
    if (!branchReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<AdminService[]>(
      `/admin/services${isSuper ? `?branchId=${branchId}` : ""}`,
    )
      .then((data) => {
        if (!cancelled) setServices(data);
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
  }, [branchReady, isSuper, branchId, reloadKey]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingNow(true);
    try {
      await apiDelete(`/admin/services/${deleting.id}`);
      toast.success("Đã vô hiệu hóa dịch vụ");
      setDeleting(null);
      setReloadKey((key) => key + 1);
    } catch (e) {
      // 409 khi còn lịch hẹn chưa hoàn thành → hiển thị đúng message tiếng Việt.
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setDeletingNow(false);
    }
  }

  if (!branchReady) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Dịch vụ</h1>
          <BranchFilter value={branchId} onChange={setBranchId} />
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Vui lòng chọn chi nhánh để quản lý dịch vụ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dịch vụ</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFilter value={branchId} onChange={setBranchId} />
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus />
            Thêm dịch vụ
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
                <TableHead>Mô tả</TableHead>
                <TableHead className="text-right">Giá</TableHead>
                <TableHead className="text-right">Thời lượng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Chưa có dịch vụ nào
                  </TableCell>
                </TableRow>
              ) : (
                services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {service.description ?? "-"}
                    </TableCell>
                    <TableCell className="text-right font-number">{formatVnd(service.price)}</TableCell>
                    <TableCell className="text-right font-number">
                      {service.durationMinutes} phút
                    </TableCell>
                    <TableCell>
                      {service.active ? (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800">
                          Đang bán
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
                          aria-label={`Sửa dịch vụ ${service.name}`}
                          onClick={() => { setEditing(service); setFormOpen(true); }}
                        >
                          <Pencil />
                        </Button>
                        {service.active ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Vô hiệu hóa ${service.name}`}
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(service)}
                          >
                            <Trash2 />
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
        <ServiceFormDialog
          service={editing}
          branchId={effectiveBranchId}
          onClose={() => setFormOpen(false)}
          onSaved={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vô hiệu hóa dịch vụ</DialogTitle>
            <DialogDescription>
              Vô hiệu hóa “{deleting?.name}”? Dịch vụ sẽ không còn được đặt lịch
              nữa nhưng lịch sử vẫn được giữ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingNow}>
              Quay lại
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingNow}>
              {deletingNow ? "Đang xử lý..." : "Vô hiệu hóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
