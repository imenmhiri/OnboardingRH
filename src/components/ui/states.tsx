import { AlertOctagon, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

/**
 * Empty and error states are drawn once here. A screen that ships without them
 * looks unfinished exactly when a reviewer opens it on a fresh database.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border px-6 py-12 text-center">
      <Inbox aria-hidden className="size-8 text-text-subtle" />
      <div className="space-y-1">
        <p className="font-display text-base text-text">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Cette section n’a pas pu être chargée',
  description,
  onRetry,
}: {
  readonly title?: string;
  readonly description: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-danger/30 bg-danger-soft px-6 py-10 text-center"
    >
      <AlertOctagon aria-hidden className="size-8 text-danger" />
      <div className="space-y-1">
        <p className="font-display text-base text-text">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-text-muted">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}
