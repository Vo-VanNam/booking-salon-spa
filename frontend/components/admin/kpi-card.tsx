'use client';

import * as React from 'react';
import { Card, Skeleton } from '@/components/ui/card';

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    default: 'text-ink',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  };
  return (
    <Card className="px-3 py-2.5">
      <p className="text-meta uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-section font-semibold tnum ${tones[tone]}`}>{value}</p>
      {hint ? <p className="text-meta text-muted">{hint}</p> : null}
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="px-3 py-2.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-24" />
    </Card>
  );
}
