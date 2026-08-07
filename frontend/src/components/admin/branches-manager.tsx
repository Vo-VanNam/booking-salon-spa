"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type AdminBranch,
} from "@/lib/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

const branchSchema = z
  .object({
    name: z.string().trim().min(1, "Vui lòng nhập tên chi nhánh").max(100, "Tên tối đa 100 ký tự"),
    address: z.string().trim().min(1, "Vui lòng nhập địa chỉ").max(255, "Địa chỉ tối đa 255 ký tự"),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isVnPhone(value), PHONE_ERROR_MESSAGE),
    openTime: z.string().min(1, "Vui lòng chọn giờ mở cửa"),
    closeTime: z.string().min(1, "Vui lòng chọn giờ đóng cửa"),
  })
  .refine((values) => !values.openTime || !values.closeTime || values.openTime < values.closeTime, {
    message: "Giờ mở cửa phải trước giờ đóng cửa",
    path: ["closeTime"],
  });

type BranchValues = z.infer<typeof branchSchema>;

function BranchFormDialog({
  branch,
  onClose,
  onSaved,
}: {
  branch: AdminBranch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const form = useForm<BranchValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      openTime: branch?.openTime ?? "09:00",
      closeTime: branch?.closeTime ?? "21:00",
    },
  });

  async function onSubmit(values: BranchValues) {
    setSaving(true);
    try {
      if (branch) {
        await apiPatch(`/admin/branches/${branch.id}`, values);
        toast.success("Đã cập nhật chi nhánh");
      } else {
        await apiPost("/admin/branches", values);
        toast.success("Đã thêm chi nhánh");
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
          <DialogTitle>{branch ? "Sửa chi nhánh" : "Thêm chi nhánh"}</DialogTitle>
          <DialogDescription>
            Giờ mở cửa / đóng cửa tính theo giờ Việt Nam (HH:mm)
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên chi nhánh</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Salon Glow Quận 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Địa chỉ</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: 12 Lê Lợi, Quận 1, TP.HCM" {...field} />
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
                  <FormLabel>Số điện thoại (không bắt buộc)</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: 02838234567" inputMode="tel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="openTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giờ mở cửa</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="closeTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giờ đóng cửa</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
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
                {saving ? "Đang lưu..." : branch ? "Lưu thay đổi" : "Thêm chi nhánh"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function BranchesManager() {
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBranch | null>(null);
  const [deleting, setDeleting] = useState<AdminBranch | null>(null);
  const [deletingNow, setDeletingNow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<AdminBranch[]>("/admin/branches")
      .then((data) => {
        if (!cancelled) setBranches(data);
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
  }, [reloadKey]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingNow(true);
    try {
      await apiDelete(`/admin/branches/${deleting.id}`);
      toast.success("Đã vô hiệu hóa chi nhánh");
      setDeleting(null);
      setReloadKey((key) => key + 1);
    } catch (e) {
      // 409 khi còn lịch hẹn chưa hoàn thành.
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setDeletingNow(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Chi nhánh</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus />
          Thêm chi nhánh
        </Button>
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
                <TableHead>Địa chỉ</TableHead>
                <TableHead>Điện thoại</TableHead>
                <TableHead>Giờ mở cửa</TableHead>
                <TableHead className="text-right">Dịch vụ</TableHead>
                <TableHead className="text-right">Stylist</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Chưa có chi nhánh nào
                  </TableCell>
                </TableRow>
              ) : (
                branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {branch.address}
                    </TableCell>
                    <TableCell className="font-number">{branch.phone ?? "-"}</TableCell>
                    <TableCell className="font-number">
                      {branch.openTime} – {branch.closeTime}
                    </TableCell>
                    <TableCell className="text-right font-number">{branch._count.services}</TableCell>
                    <TableCell className="text-right font-number">{branch._count.stylists}</TableCell>
                    <TableCell>
                      {branch.active ? (
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
                          aria-label={`Sửa chi nhánh ${branch.name}`}
                          onClick={() => {
                            setEditing(branch);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        {branch.active ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Vô hiệu hóa ${branch.name}`}
                            onClick={() => setDeleting(branch)}
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
        <BranchFormDialog
          branch={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vô hiệu hóa chi nhánh</DialogTitle>
            <DialogDescription>
              Vô hiệu hóa “{deleting?.name}”? Khách sẽ không đặt lịch được tại chi
              nhánh này nữa.
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
