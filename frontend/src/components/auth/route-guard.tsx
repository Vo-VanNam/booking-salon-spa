"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { homePathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export { useAuth } from "@/components/auth-provider";

/**
 * Bảo vệ route phía client: đọc người dùng từ AuthProvider (đã fetch /auth/me),
 * chuyển hướng về /dang-nhap nếu chưa đăng nhập hoặc sai quyền. Tradeoff: không
 * chặn được ở tầng SSR/middleware, mọi API admin vẫn được backend bảo vệ bằng
 * JWT + RolesGuard.
 */
export function RouteGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const allowedKey = useMemo(() => allowedRoles.join(","), [allowedRoles]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/dang-nhap");
      return;
    }
    if (!allowedKey.split(",").includes(user.role)) {
      router.replace(homePathForRole(user.role));
    }
  }, [loading, user, allowedKey, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-full max-w-xl" />
        <Skeleton className="h-6 w-full max-w-md" />
        <Skeleton className="h-6 w-full max-w-lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Đang chuyển hướng đến trang đăng nhập...
        </p>
      </div>
    );
  }

  // Đã xác thực nhưng sai role — tránh render nội dung trước khi useEffect redirect.
  if (!allowedKey.split(",").includes(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền truy cập trang này
        </p>
        <Button variant="outline" onClick={() => void refresh()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
