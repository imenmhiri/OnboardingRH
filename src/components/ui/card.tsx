import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[calc(var(--radius)+2px)] border border-border bg-surface-raised shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border p-5', className)}>
      <div className="space-y-1">
        <h2 className="font-display text-lg leading-tight text-text">{title}</h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}
