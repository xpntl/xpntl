// packages/ui/src/primitives/CloseEsc.tsx
//
// The one canonical close affordance: a bordered "✕ esc" chip. Used for every
// modal/panel/overlay close site-wide so they read consistently. Forwards a
// ref + props so it can be the asChild target of a Radix *.Close / *.Cancel
// (which wires the close onClick), or a plain button on its own.

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Kbd } from './Kbd';

export const CloseEsc = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function CloseEsc({ className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Close"
        className={`inline-flex items-center justify-center gap-[4px] h-[24px] px-[8px] border border-xp-border rounded-xp-sm bg-xp-canvas text-xp-muted font-mono text-[10px] leading-none cursor-pointer hover:text-xp-ink hover:border-xp-input transition-colors ${className ?? ''}`}
        {...props}
      >
        <span aria-hidden="true">✕</span> <Kbd size="sm">esc</Kbd>
      </button>
    );
  },
);
