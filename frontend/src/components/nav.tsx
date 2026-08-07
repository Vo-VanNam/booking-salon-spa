"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, Scissors, Settings, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import { logout, roleLabel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const HIDE_PREFIXES = ["/admin", "/stylist", "/dang-nhap", "/dang-ky"];

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false;
  return HIDE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function UserMenu() {
  const router = useRouter();
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  const displayName = user.name ?? user.email ?? user.phone ?? "Tài khoản";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      toast.success("Đã đăng xuất");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Đăng xuất thất bại, vui lòng thử lại");
      setLoggingOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2"
          aria-label="Tài khoản"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || <User className="size-4" />}
          </span>
          <span className="hidden text-sm font-medium sm:inline">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {roleLabel(user.role)}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "super_admin" || user.role === "branch_admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Settings className="size-4" />
              Trang quản trị
            </Link>
          </DropdownMenuItem>
        ) : null}
        {user.role === "stylist" ||
        user.role === "super_admin" ||
        user.role === "branch_admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/stylist">
              <Scissors className="size-4" />
              Lịch stylist
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-1 p-4">
      <NavLink href="/dat-lich" onClick={onNavigate}>
        Đặt lịch
      </NavLink>
      <NavLink href="/stylist" onClick={onNavigate}>
        Cổng stylist
      </NavLink>
      <NavLink href="/admin" onClick={onNavigate}>
        Quản trị salon
      </NavLink>
      <div className="my-2 h-px bg-border" />
      {user ? (
        <div className="flex flex-col gap-2">
          <p className="px-2 text-sm font-semibold">
            {user.name ?? user.email ?? user.phone ?? "Tài khoản"}
          </p>
          <p className="px-2 text-xs text-muted-foreground">
            {roleLabel(user.role)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" onClick={onNavigate}>
            <Link href="/dang-nhap">Đăng nhập</Link>
          </Button>
          <Button asChild onClick={onNavigate}>
            <Link href="/dang-ky">Đăng ký</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (shouldHide(pathname)) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold"
          aria-label="Salon Glow — Trang chủ"
        >
          <Sparkles className="size-5 text-primary" />
          <span>Salon Glow</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <NavLink href="/dat-lich">Đặt lịch</NavLink>
          <NavLink href="/stylist">Stylist</NavLink>
          <NavLink href="/admin">Quản trị</NavLink>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <UserMenu />
          ) : (
            <>
              <Button variant="ghost" asChild size="sm">
                <Link href="/dang-nhap">Đăng nhập</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dang-ky">Đăng ký</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Mở menu"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <MobileNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
