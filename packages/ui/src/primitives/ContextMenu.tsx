// packages/ui/src/primitives/ContextMenu.tsx
//
// Static menu — render inline or anchor it yourself.
// `divider: true` inserts a hairline rule.

import type { ReactNode } from 'react';

export interface ContextMenuItem {
  label?: ReactNode;
  leading?: ReactNode;
  kbd?: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  divider?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
}

export function ContextMenu({ items }: ContextMenuProps) {
  return (
    <div
      role="menu"
      className="bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-2 p-[6px] min-w-[200px]"
    >
      {items.map((item, i) => {
        if (item.divider) return (
          <div key={i} className="h-px bg-xp-hairline my-[4px]" />
        );
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={item.onClick}
            className={`flex items-center gap-[8px] w-full py-[6px] px-[10px] bg-transparent border-0 rounded-xp-sm font-mono text-[12px] text-left hover:bg-xp-layer ${
              item.destructive ? 'text-xp-danger' : 'text-xp-ink'
            } ${
              item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            {item.leading}
            <span className="flex-1">{item.label}</span>
            {item.kbd && <span className="text-xp-muted text-[10px]">{item.kbd}</span>}
          </button>
        );
      })}
    </div>
  );
}
