"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  Scissors,
} from "lucide-react";

import { ApiError, apiGet, type Branch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type BranchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; branches: Branch[] };

export default function Home() {
  const [branchState, setBranchState] = useState<BranchState>({
    status: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBranchState({ status: "loading" });
    apiGet<Branch[]>("/branches")
      .then((branches) => {
        if (!cancelled) {
          setBranchState({ status: "success", branches });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Đã có lỗi xảy ra, vui lòng thử lại sau";
        setBranchState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="min-h-screen">
      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-24 right-[-6rem] size-72 rounded-full bg-secondary blur-3xl sm:size-96"
          />
          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 py-14 text-center sm:px-6 sm:py-20">
            <Badge variant="secondary" className="mb-5">
              Salon &amp; Spa
            </Badge>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Thư giãn cùng Salon Glow
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Cắt tóc, massage, spa chăm sóc sức khỏe — đặt lịch trực tuyến
              nhanh chóng
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/dat-lich">
                <Scissors />
                Đặt lịch ngay
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Chi nhánh của chúng tôi
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Tìm chi nhánh gần bạn và đặt lịch ngay hôm nay
          </p>

          {branchState.status === "loading" ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : branchState.status === "error" ? (
            <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-border bg-muted px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {branchState.message}
              </p>
              <Button
                variant="outline"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Thử lại
              </Button>
            </div>
          ) : branchState.branches.length === 0 ? (
            <p className="mt-8 rounded-xl border border-border bg-muted px-6 py-12 text-center text-sm text-muted-foreground">
              Chưa có chi nhánh nào
            </p>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {branchState.branches.map((branch) => (
                <Card key={branch.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {branch.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <p className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      {branch.address}
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-4 shrink-0" />
                      Giờ mở cửa:{" "}
                      <span className="font-number text-foreground">
                        {branch.openTime} – {branch.closeTime}
                      </span>
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4 shrink-0" />
                      <span className="font-number text-foreground">
                        {branch.phone}
                      </span>
                    </p>
                    <Link
                      href="/dat-lich"
                      className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Đặt lịch ngay
                      <ChevronRight className="size-4" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <Separator />
        <div className="flex flex-col items-center justify-between gap-3 pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© 2026 Salon Glow</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/dat-lich" className="hover:text-foreground hover:underline">
              Đặt lịch
            </Link>
            <Link href="/stylist" className="hover:text-foreground hover:underline">
              Cổng stylist
            </Link>
            <Link href="/admin" className="hover:text-foreground hover:underline">
              Quản lý salon
            </Link>
            <Link href="/dang-nhap" className="hover:text-foreground hover:underline">
              Đăng nhập
            </Link>
            <Link href="/dang-ky" className="hover:text-foreground hover:underline">
              Đăng ký
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
