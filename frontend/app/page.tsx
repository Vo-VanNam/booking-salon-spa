import Link from 'next/link';
import { BookingWizard } from '@/components/booking/booking-wizard';
import { AiChatWidget } from '@/components/chat/ai-chat-widget';

export default function HomePage() {
  return (
    <main>
      <nav className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-4 text-body-sm">
        <span className="font-medium text-ink">Salon &amp; Spa</span>
        <span className="flex items-center gap-3">
          <Link href="/lookup" className="text-accent underline-offset-4 hover:underline">
            Tra cứu lịch
          </Link>
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">
            Nhân viên
          </Link>
        </span>
      </nav>
      <BookingWizard />
      <AiChatWidget />
    </main>
  );
}
