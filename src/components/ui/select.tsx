'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Select = SelectPrimitive.Root;

export function SelectTrigger({
  placeholder,
  className,
  ...props
}: SelectPrimitive.SelectTriggerProps & { readonly placeholder: string }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'inline-flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius)]',
        'border border-border bg-surface-raised px-3 text-sm text-text hover:border-border-strong',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon>
        <ChevronDown aria-hidden className="size-4 text-text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ children }: { readonly children: ReactNode }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className="z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius)] border border-border bg-surface-raised shadow-overlay"
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ value, children }: { readonly value: string; readonly children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="flex cursor-default items-center justify-between gap-2 rounded-[calc(var(--radius)-4px)] px-2.5 py-1.5 text-sm text-text data-[highlighted]:bg-surface-sunken data-[highlighted]:outline-none"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check aria-hidden className="size-4 text-brand" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
