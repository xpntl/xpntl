// packages/ui/src/primitives/Tabs.tsx
//
// Underline-bar tabs with caps labels and optional counts.

import type { ReactNode } from 'react';

export interface TabsItem {
  value: string;
  label: ReactNode;
  count?: number;
}

export interface TabsProps {
  value: string;
  onChange?: (value: string) => void;
  tabs: TabsItem[];
}

export function Tabs({ value, onChange, tabs }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-0 border-b border-xp-border">
      {tabs.map(t => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(t.value)}
            className={`bg-transparent border-0 py-[8px] px-[12px] cursor-pointer font-mono text-[11.5px] tracking-[var(--xp-track-wide)] uppercase inline-flex items-center gap-[6px] -mb-px border-b-2 ${
              active
                ? 'text-xp-ink font-semibold border-b-xp-accent-strong'
                : 'text-xp-muted font-medium border-b-transparent'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className="text-xp-muted text-[10px] font-medium">
                {String(t.count).padStart(2, '0')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
