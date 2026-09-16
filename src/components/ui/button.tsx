import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-text hover:brightness-110 active:brightness-95',
  secondary:
    'bg-surface-raised text-text border border-border hover:border-border-strong hover:bg-surface-sunken',
  ghost: 'text-text-muted hover:bg-surface-sunken hover:text-text',
  danger: 'bg-danger text-danger-text hover:brightness-110 active:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly asChild?: boolean;
  /** Shows a spinner and blocks the action, while keeping the button focusable. */
  readonly loading?: boolean;
  readonly children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  asChild = false,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  // Slot (Radix) demande exactement un enfant React valide pour pouvoir y
  // fusionner ses props : lui passer le repli `null` du spinner à côté de
  // l'enfant réel le fait échouer. En délégation (`asChild`), on transmet
  // donc `children` tel quel ; la combinaison chargement + délégation n'a
  // pas de sens ici — un lien ne se met pas en `aria-busy`.
  const content = asChild ? (
    children
  ) : (
    <>
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </>
  );

  return (
    <Component
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius)] font-medium',
        'transition-[background-color,border-color,filter] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      // aria-busy tells a screen reader the action is running; the visible
      // spinner alone would say nothing.
      aria-busy={loading || undefined}
      disabled={disabled ?? loading}
      {...props}
    >
      {content}
    </Component>
  );
}
