// packages/ui/src/primitives/DropdownMenu.tsx
//
// Radix Dropdown Menu. Portal-rendered, collision-aware, animated.
// Items support danger variant, disabled state, and keyboard shortcuts.

import type { ReactNode } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Kbd } from './Kbd';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
}

export function DropdownMenu({ trigger, items }: DropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          data-xp-content
          sideOffset={4}
          align="start"
          className="z-[70] min-w-[200px] p-[4px] bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-3"
        >
          {items.map((item, i) => (
            <DropdownMenuPrimitive.Item
              key={i}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={`flex items-center gap-[8px] w-full px-[8px] py-[5px] rounded-xp-sm font-mono text-[12px] outline-none cursor-pointer select-none transition-colors duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)] data-[highlighted]:bg-xp-layer ${
                item.danger
                  ? 'text-xp-danger data-[highlighted]:text-xp-danger'
                  : 'text-xp-ink'
              } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <Kbd size="sm">{item.shortcut}</Kbd>
              )}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
