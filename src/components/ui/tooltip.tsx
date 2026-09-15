'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * A tooltip never carries information that exists nowhere else: it is invisible
 * on touch devices and to a keyboard user who never hovers.
 */
export function Tooltip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 rounded-md bg-text px-2.5 py-1.5 text-xs text-surface-raised shadow-overlay"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[var(--text)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
