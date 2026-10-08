import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-border bg-surface shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-section font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm text-muted', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-border px-4 py-3', className)} {...props} />;
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-2 text-muted border-border',
    success: 'bg-[#E7F3EC] text-success border-[#BFDCCB]',
    warning: 'bg-[#FBF0DC] text-warning border-[#E8D3A8]',
    danger: 'bg-[#FBE9E7] text-danger border-[#F0C6C2]',
    info: 'bg-[#E8F0F8] text-info border-[#C2D5E8]',
    accent: 'bg-accent-soft text-accent border-[#DCCDB8]',
  };
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-medium', tones[tone], className)}
      {...props}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center', className)}>
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="text-body font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-body-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full rounded', className)} />;
}
