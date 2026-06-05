// packages/ui/src/primitives/Tooltip.tsx
//
// Hover tooltip built on Radix Tooltip. Collision-aware positioning,
// keyboard accessible, portal-rendered.

import type { ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  delay = 400,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 px-[7px] py-[3px] bg-xp-ink text-xp-surface font-mono text-[10.5px] tracking-[var(--xp-track-wide)] leading-none whitespace-nowrap rounded-xp-sm shadow-xp-1 pointer-events-none animate-xp-fade-in"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
