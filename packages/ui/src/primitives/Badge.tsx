// packages/ui/src/primitives/Badge.tsx
//
// Status indicator with optional leading dot. Caps-styled text on a hairline frame.

import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}

const DOT_COLOR: Record<BadgeTone, string> = {
  neutral: 'bg-xp-muted',
  accent:  'bg-xp-accent-strong',
  success: 'bg-xp-success',
  danger:  'bg-xp-danger',
  warn:    'bg-xp-warn',
};

export function Badge({ children, tone = 'neutral', dot = true }: BadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-[5px] py-px px-[6px] border border-xp-border rounded-xp-sm bg-transparent text-xp-ink font-mono text-[10.5px] font-medium tracking-[var(--xp-track-wide)] uppercase leading-[1.4]"
    >
      {dot && (
        <span className={`w-[6px] h-[6px] rounded-xp-pill ${DOT_COLOR[tone]}`} />
      )}
      {children}
    </span>
  );
}
