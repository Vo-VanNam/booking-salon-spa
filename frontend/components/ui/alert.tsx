import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  action,
}: {
  tone?: 'info' | 'success' | 'danger' | 'warning';
  title?: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const tones = {
    info: { border: 'border-[#C2D5E8]', bg: 'bg-[#E8F0F8]', text: 'text-info', Icon: Info },
    success: { border: 'border-[#BFDCCB]', bg: 'bg-[#E7F3EC]', text: 'text-success', Icon: CheckCircle2 },
    danger: { border: 'border-[#F0C6C2]', bg: 'bg-[#FBE9E7]', text: 'text-danger', Icon: AlertTriangle },
    warning: { border: 'border-[#E8D3A8]', bg: 'bg-[#FBF0DC]', text: 'text-warning', Icon: AlertTriangle },
  }[tone];

  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-card border px-3 py-2.5', tones.border, tones.bg, className)}>
      <tones.Icon size={18} className={cn('mt-0.5 shrink-0', tones.text)} aria-hidden />
      <div className="flex-1">
        {title ? <p className={cn('text-body-sm font-medium', tones.text)}>{title}</p> : null}
        {children ? <div className="text-body-sm text-ink">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
