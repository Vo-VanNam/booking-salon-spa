'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

/** Đăng nhập cho nhân viên (branch_admin / super_admin / stylist) — khách không cần đăng nhập. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      if (user.role === 'stylist') router.push('/stylist');
      else if (user.role === 'branch_admin' || user.role === 'super_admin') router.push('/admin');
      else router.push('/');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <p className="text-meta uppercase tracking-wide text-muted">Khu vực nhân viên</p>
        <h1 className="text-title font-semibold text-ink">Đăng nhập</h1>
        <p className="mt-1 text-body-sm text-muted">
          Dành cho quản lý chi nhánh, quản trị chuỗi và stylist. Khách đặt lịch không cần đăng nhập.
        </p>
      </div>

      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            autoComplete="username"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" loading={loading}>
          Đăng nhập
        </Button>
      </form>

      <p className="mt-4 text-body-sm text-muted">
        Quên mật khẩu? Liên hệ quản trị chuỗi. Hoặc{' '}
        <Link href="/" className="text-accent underline">
          quay lại trang đặt lịch
        </Link>
        .
      </p>
    </main>
  );
}
