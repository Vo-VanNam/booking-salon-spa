'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, CalendarDays, LayoutDashboard, LogOut, Scissors, Sparkles, Users } from 'lucide-react';
import { clearSession, getStoredUser, loadProfile } from '@/lib/api';
import type { AuthUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/input';

const NAV = [
  { href: '/admin', label: 'Lịch chi nhánh', icon: CalendarDays },
  { href: '/admin/services', label: 'Dịch vụ & giá', icon: Scissors },
  { href: '/admin/stylists', label: 'Stylist', icon: Users },
  { href: '/admin/revenue', label: 'Doanh thu', icon: BarChart3 },
  { href: '/admin/ai', label: 'Trợ lý phân tích', icon: Sparkles },
];

interface BranchOption {
  id: string;
  name: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [branches, setBranches] = React.useState<BranchOption[]>([]);
  const [branchId, setBranchId] = React.useState<string>('');

  React.useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/login');
      return;
    }
    if (stored.role !== 'branch_admin' && stored.role !== 'super_admin') {
      router.replace(stored.role === 'stylist' ? '/stylist' : '/login');
      return;
    }
    setUser(stored);
    setChecked(true);
    loadProfile()
      .then((profile) => {
        setUser(profile);
        // branch_admin luôn bị giới hạn ở chi nhánh của mình; super_admin mặc định xem toàn chuỗi.
        const initial = profile.role === 'branch_admin' ? (profile.branch_id ?? '') : '';
        setBranchId(initial);
        window.localStorage.setItem('booking.admin_branch', initial);
        // Phát sự kiện để mọi trang con (lịch, doanh thu, trợ lý) nạp lại đúng phạm vi chi nhánh.
        window.dispatchEvent(new Event('booking:branch-change'));
      })
      .catch(() => {
        clearSession();
        router.replace('/login');
      });
  }, [router]);

  React.useEffect(() => {
    if (!user) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8100'}/branches`)
      .then((response) => response.json())
      .then((data) => setBranches(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => setBranches([]));
  }, [user]);

  if (!checked || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-body-sm text-muted">Đang tải bảng điều khiển…</main>
    );
  }

  const canSwitchBranch = user.role === 'super_admin';

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface-2 px-3 py-4 lg:flex">
        <div className="mb-4 flex items-center gap-2 px-2">
          <LayoutDashboard size={18} className="text-accent" aria-hidden />
          <span className="text-body font-semibold text-ink">Quản trị</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Điều hướng quản trị">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-control px-2 py-2 text-body-sm text-ink hover:bg-surface-3 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
            >
              <item.icon size={16} aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-2 pt-4 text-body-sm">
          <div>
            <label htmlFor="branch-switch" className="text-meta uppercase tracking-wide text-muted">
              Chi nhánh
            </label>
            <Select
              id="branch-switch"
              value={branchId}
              disabled={!canSwitchBranch}
              onChange={(event) => {
                setBranchId(event.target.value);
                window.localStorage.setItem('booking.admin_branch', event.target.value);
                window.dispatchEvent(new Event('booking:branch-change'));
              }}
            >
              {canSwitchBranch ? <option value="">Toàn chuỗi</option> : null}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="rounded-control border border-border bg-surface px-2 py-2">
            <p className="font-medium text-ink">{user.name}</p>
            <p className="text-meta text-muted">{user.email}</p>
            <p className="text-meta text-muted">
              {user.role === 'super_admin' ? 'Quản trị chuỗi' : 'Quản lý chi nhánh'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.replace('/login');
            }}
            className="flex items-center gap-2 rounded-control px-2 py-2 text-left text-body-sm text-danger hover:bg-surface-3"
          >
            <LogOut size={16} aria-hidden /> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface-2 px-3 py-2 lg:hidden thin-scroll" aria-label="Điều hướng quản trị (di động)">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('flex shrink-0 items-center gap-1 rounded-control px-3 py-2 text-body-sm text-ink hover:bg-surface-3')}
            >
              <item.icon size={16} aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
