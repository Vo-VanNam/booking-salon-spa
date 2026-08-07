"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/route-guard";
import { ApiError, apiGet, type AdminBranch } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Bộ lọc chi nhánh chỉ hiển thị với super_admin (branch_admin luôn bị backend
 * khóa trong chi nhánh của mình). Khi chưa có chi nhánh nào được chọn,
 * onChange được gọi với giá trị rỗng và trang dữ liệu không gọi API.
 */
export function BranchFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (branchId: string) => void;
}) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    let cancelled = false;
    apiGet<AdminBranch[]>("/admin/branches")
      .then((data) => {
        if (!cancelled) setBranches(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : "Không tải được danh sách chi nhánh");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  if (user?.role !== "super_admin") return null;

  return (
    <div className="w-full sm:w-56">
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger aria-label="Chọn chi nhánh">
          <SelectValue placeholder="Chọn chi nhánh" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
