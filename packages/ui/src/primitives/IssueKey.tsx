// packages/ui/src/primitives/IssueKey.tsx
//
// IssueKey — 03 hairline-box framed chip. Canonical xpntl issue-key style.
// Used wherever you'd print a key like PER-103, AUT-44.

import type { ReactNode } from 'react';

export interface IssueKeyProps {
  children: ReactNode;
  size?: 'sm' | 'md';
  tone?: 'default' | 'inverted';
}

export function IssueKey({ children, size = 'md', tone = 'default' }: IssueKeyProps) {
  const inverted = tone === 'inverted';
  return (
    <span
      title={`Issue ${typeof children === 'string' || typeof children === 'number' ? children : ''}`.trim()}
      className={`inline-flex items-center justify-center rounded-xp-sm font-mono font-medium tracking-[var(--xp-track-wide)] leading-none ${
        inverted
          ? 'border border-xp-ink bg-xp-ink text-xp-canvas'
          : 'border border-xp-border bg-transparent text-xp-ink'
      } ${
        size === 'sm'
          ? 'text-[9.5px] px-[5px] h-[16px]'
          : 'text-[10.5px] px-[6px] py-px h-[18px]'
      }`}
    >
      {children}
    </span>
  );
}
