'use client';

import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  children,
  align = 'end',
}: {
  readonly children: ReactNode;
  readonly align?: 'start' | 'center' | 'end';
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-[var(--radius)] border border-border bg-surface-raised p-1 shadow-overlay"
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  className,
}: {
  readonly children: ReactNode;
  readonly onSelect?: () => void;
  readonly className?: string;
}) {
  return (
    <MenuPrimitive.Item
      {...(onSelect ? { onSelect: () => onSelect() } : {})}
      className={cn(
        'flex cursor-default items-center gap-2 rounded-[calc(var(--radius)-4px)] px-2.5 py-1.5 text-sm text-text',
        'data-[highlighted]:bg-surface-sunken data-[highlighted]:outline-none',
        className,
      )}
    >
      {children}
    </MenuPrimitive.Item>
  );
}

export function DropdownMenuLabel({ children }: { readonly children: ReactNode }) {
  return <div className="px-2.5 py-1.5 text-xs font-medium text-text-subtle">{children}</div>;
}

export function DropdownMenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-border" />;
}
