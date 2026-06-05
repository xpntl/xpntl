// packages/ui/src/primitives/EmptyState.tsx
//
// Compact empty state placeholder. Centered layout with optional icon,
// muted text, and an action slot.

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-[8px] py-[24px] px-[16px] text-center">
      {icon && (
        <div className="text-xp-faint text-[20px] leading-none">
          {icon}
        </div>
      )}
      <span className="text-[12px] font-mono font-medium text-xp-muted tracking-[var(--xp-track-wide)] uppercase">
        {title}
      </span>
      {description && (
        <span className="text-[11px] font-mono text-xp-faint leading-[1.5] max-w-[280px]">
          {description}
        </span>
      )}
      {action && (
        <div className="mt-[4px]">
          {action}
        </div>
      )}
    </div>
  );
}
