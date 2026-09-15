'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex gap-1 rounded-[var(--radius)] bg-surface-sunken p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm font-medium text-text-muted',
        'hover:text-text',
        // L'onglet actif est signale par un fond et un contraste, pas par une teinte seule.
        'data-[state=active]:bg-surface-raised data-[state=active]:text-text data-[state=active]:shadow-card',
        className,
      )}
      {...props}
    />
  );
}
