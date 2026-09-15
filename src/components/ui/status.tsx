import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, Loader } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/cn';

/**
 * Regle non negociable du projet : un statut ne passe jamais par la couleur
 * seule. Chaque ton porte une icone distincte et un libelle, pour rester lisible
 * en niveaux de gris comme pour un daltonien.
 */
export type StatusTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger' | 'cancelled';

const TONES: Record<StatusTone, { icon: ComponentType<{ className?: string }>; classes: string }> = {
  neutral: { icon: CircleDashed, classes: 'bg-surface-sunken text-text-muted border-border' },
  progress: { icon: Loader, classes: 'bg-info-soft text-info border-info/30' },
  success: { icon: CheckCircle2, classes: 'bg-success-soft text-success border-success/30' },
  warning: { icon: Clock, classes: 'bg-warning-soft text-warning border-warning/30' },
  danger: { icon: AlertTriangle, classes: 'bg-danger-soft text-danger border-danger/30' },
  cancelled: { icon: Ban, classes: 'bg-surface-sunken text-text-muted border-border' },
};

export interface StatusBadgeProps {
  readonly tone: StatusTone;
  readonly label: string;
  readonly className?: string;
}

export function StatusBadge({ tone, label, className }: StatusBadgeProps) {
  const { icon: Icon, classes } = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        classes,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
