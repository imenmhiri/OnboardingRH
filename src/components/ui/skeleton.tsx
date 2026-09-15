import { cn } from '@/lib/cn';

/**
 * Loading placeholder. It is hidden from assistive technology: the region that
 * contains it carries aria-busy, so a screen reader hears "chargement" once
 * instead of a stream of empty boxes.
 */
export function Skeleton({ className }: { readonly className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-sunken', className)} />;
}

export function SkeletonList({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div aria-busy role="status" aria-label="Chargement en cours" className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}
