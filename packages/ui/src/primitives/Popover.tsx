// packages/ui/src/primitives/Popover.tsx
//
// Anchored popover built on Radix Popover. Portal-rendered, collision-aware.
// Scale animation via data-xp-content on Content.

import type { ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

export interface PopoverProps {
  children: ReactNode;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export function Popover({
  children,
  trigger,
  open,
  onOpenChange,
  side = 'bottom',
  align = 'start',
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-xp-content
          side={side}
          align={align}
          sideOffset={4}
          className="z-30 min-w-[180px] p-[4px] bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-2"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
