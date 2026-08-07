"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  LogOut,
  Menu,
  Scissors,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { RouteGuard, useAuth } from "@/components/auth/route-guard";
import { logout, roleLabel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  superOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Lịch", icon: CalendarDays },
  { href: "/admin/dich-vu", label: "Dịch vụ", icon: Scissors },
  { href: "/admin/stylists", label: "Stylist", icon: Users },
  { href: "/admin/doanh-thu", label: "Doanh thu", icon: Wallet },
  { href: "/admin/chi-nhanh", label: "Chi nhánh", icon: Building2, superOnly: true },
  { href: "/admin/tai-khoan", label: "Tài khoản", icon: UserPlus, superOnly: true },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="flex items-center gap-2 px-2 font-semibold" onClick={onNavigate}>
        <Sparkles className="size-5 text-primary" />
        Salon Glow
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          Quản trị
        </span>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => !item.superOnly || isSuper).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function AdminHeader() {
  const router = useRouter();
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      toast.success("Đã đăng xuất");
      router.push("/dang-nhap");
    } catch {
      toast.error("Đăng xuất thất bại, vui lòng thử lại");
      setLoggingOut(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Mở menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Menu quản trị</SheetTitle>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground hover:text-foreground">
          <Link href="/" aria-label="Quay lại trang chủ">
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Trang chủ</span>
          </Link>
        </Button>
        <span className="hidden h-5 w-px bg-border sm:inline-block" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user?.name ?? user?.email ?? "Quản trị viên"}</p>
          <p className="truncate text-xs text-muted-foreground">{user ? roleLabel(user.role) : ""}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout} disabled={loggingOut}>
        <LogOut />
        {loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
      </Button>
    </header>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={["super_admin", "branch_admin"]}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-background lg:block">
          <SidebarContent />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader />
          <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </RouteGuard>
  );
}
