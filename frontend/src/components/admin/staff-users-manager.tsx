"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  ApiError,
  apiGet,
  apiPost,
  type AdminBranch,
  type AdminStylist,
} from "@/lib/api";
import { isVnPhone, PHONE_ERROR_MESSAGE } from "@/lib/validate";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

const userSchema = z
  .object({
    role: z.enum(["branch_admin", "stylist"], { message: "Vui lòng chọn vai trò" }),
    phone: z.string().trim().refine(isVnPhone, PHONE_ERROR_MESSAGE),
    email: z
      .string()
      .trim()
      .max(255, "Email tối đa 255 ký tự")
      .optional()
      .transform((value) => (value ? value : undefined)),
    password: z
      .string()
      .min(8, "Mật khẩu tối thiểu 8 ký tự")
      .max(128, "Mật khẩu tối đa 128 ký tự"),
    branchId: z.string().min(1, "Vui lòng chọn chi nhánh"),
    stylistId: z.string().optional(),
  })
  .refine((values) => values.role !== "stylist" || Boolean(values.stylistId), {
    message: "Vui lòng chọn stylist",
    path: ["stylistId"],
  });

type UserValues = z.infer<typeof userSchema>;

export function StaffUsersManager() {
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [stylists, setStylists] = useState<AdminStylist[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      role: "branch_admin",
      phone: "",
      email: "",
      password: "",
      branchId: "",
      stylistId: "",
    },
  });

  const role = form.watch("role");
  const branchId = form.watch("branchId");

  useEffect(() => {
    let cancelled = false;
    apiGet<AdminBranch[]>("/admin/branches")
      .then((data) => {
        if (!cancelled) setBranches(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Không tải được danh sách chi nhánh");
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Khi chọn stylist, lấy danh sách stylist của chi nhánh để liên kết tài khoản.
  useEffect(() => {
    if (role !== "stylist" || !branchId) {
      setStylists([]);
      return;
    }
    let cancelled = false;
    apiGet<AdminStylist[]>(`/admin/stylists?branchId=${branchId}`)
      .then((data) => {
        if (!cancelled) setStylists(data);
      })
      .catch(() => {
        if (!cancelled) setStylists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role, branchId]);

  async function onSubmit(values: UserValues) {
    setSaving(true);
    try {
      await apiPost("/admin/users", {
        phone: values.phone,
        email: values.email,
        password: values.password,
        role: values.role,
        branchId: values.role === "branch_admin" ? values.branchId : undefined,
        stylistId: values.role === "stylist" ? values.stylistId : undefined,
      });
      toast.success("Đã tạo tài khoản");
      form.reset({ role: "branch_admin", phone: "", email: "", password: "", branchId: "", stylistId: "" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Tạo tài khoản nhân viên</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài khoản quản lý chi nhánh / stylist</CardTitle>
          <CardDescription>
            Tài khoản dùng chung mật khẩu của bạn để đăng nhập vào trang quản trị
            hoặc trang stylist
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingBranches ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vai trò</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="branch_admin">Quản lý chi nhánh</SelectItem>
                          <SelectItem value="stylist">Stylist</SelectItem>
                        </SelectContent>
                      </Select>
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
                          <Input placeholder="VD: 0901234567" inputMode="tel" {...field} />
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
                        <FormLabel>Email (không bắt buộc)</FormLabel>
                        <FormControl>
                          <Input placeholder="VD: quan@salonglow.vn" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mật khẩu</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Tối thiểu 8 ký tự"
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="branchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chi nhánh</FormLabel>
                      <Select value={field.value || undefined} onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("stylistId", "");
                      }}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn chi nhánh" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {role === "stylist" ? (
                  <FormField
                    control={form.control}
                    name="stylistId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stylist</FormLabel>
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  branchId ? "Chọn stylist" : "Chọn chi nhánh trước"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stylists.map((stylist) => (
                              <SelectItem key={stylist.id} value={stylist.id}>
                                {stylist.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                <Button type="submit" disabled={saving}>
                  {saving ? "Đang tạo..." : "Tạo tài khoản"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
