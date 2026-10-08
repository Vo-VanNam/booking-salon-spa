import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-meta uppercase tracking-wide text-muted">Lỗi 404</p>
      <h1 className="text-title font-semibold text-ink">Không tìm thấy trang này</h1>
      <p className="text-body-sm text-muted">
        Đường dẫn có thể đã cũ hoặc bị gõ sai. Bạn có thể quay lại trang đặt lịch hoặc tra cứu lịch hẹn theo số điện thoại.
      </p>
      <div className="mt-2 flex gap-2">
        <Link
          href="/"
          className="rounded-control bg-accent px-4 py-2.5 text-body-sm font-medium text-surface hover:bg-accent-hover"
        >
          Về trang đặt lịch
        </Link>
        <Link
          href="/lookup"
          className="rounded-control border border-border-strong px-4 py-2.5 text-body-sm font-medium text-ink hover:bg-surface-2"
        >
          Tra cứu lịch hẹn
        </Link>
      </div>
    </main>
  );
}
