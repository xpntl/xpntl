// packages/ui/src/primitives/Kbd.tsx
//
// Keyboard cap. Mono, hairline bottom, tight padding. A signature in xpntl
// because the keyboard is the product.

import type { ReactNode } from 'react';

export interface KbdProps {
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function Kbd({ children, size = 'md' }: KbdProps) {
  return (
    <span
      className={`inline-flex items-center justify-center border border-xp-border border-b-2 rounded-xp-sm bg-xp-surface text-xp-muted font-mono font-medium leading-none tracking-normal ${
        size === 'sm'
          ? 'text-[10px] px-[4px] min-w-[16px] h-[16px]'
          : 'text-[11px] px-[5px] min-w-[18px] h-[18px]'
      }`}
    >
      {children}
    </span>
  );
}
