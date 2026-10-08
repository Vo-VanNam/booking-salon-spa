'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('block text-body-sm font-medium text-ink', className)}
    {...props}
  />
));
Label.displayName = 'Label';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, error, hint, id, ...props }, ref) => {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="w-full">
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 w-full rounded-control border bg-surface px-3 text-body text-ink placeholder:text-muted/70',
          'focus:border-border-strong focus:outline-none focus:ring-0',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-meta text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-control border border-border bg-surface px-3 py-2 text-body text-ink placeholder:text-muted/70',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-control border border-border bg-surface px-3 text-body text-ink focus:border-border-strong',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
