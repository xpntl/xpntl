// packages/ui/src/primitives/Pill.tsx
//
// Removable filter chip. Active state uses accent-strong border + text on
// accent-tint background.

import type { ReactNode } from 'react';

export interface PillProps {
  children: ReactNode;
  leading?: ReactNode;
  onRemove?: () => void;
  active?: boolean;
}

export function Pill({ children, leading, onRemove, active = false }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] py-[2px] px-[8px] rounded-xp-pill font-mono text-[11.5px] tracking-[var(--xp-track-snug)] ${
        active
          ? 'border border-xp-accent-strong bg-xp-accent-tint text-xp-accent-strong'
          : 'border border-xp-border bg-xp-surface text-xp-ink'
      }`}
    >
      {leading}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="bg-transparent border-0 text-xp-muted cursor-pointer font-mono text-[10px] p-0 leading-none"
        >×</button>
      )}
    </span>
  );
}
