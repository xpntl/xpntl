// apps/web/src/components/CellPopover.tsx
//
// PER-108 — Anchored popover for inline cell editing. Renders a small panel
// positioned beneath the anchor element, closes on Escape / outside click /
// option select. Designed for the issue-list row cells (state, priority,
// assignee, etc.) but the primitive is generic.

import { type ReactNode, useEffect, useRef } from 'react';

export interface CellPopoverProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** Offset below the anchor in pixels. */
  offset?: number;
}

export function CellPopover({
  anchor,
  onClose,
  children,
  width = 200,
  offset = 4,
}: CellPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!panelRef.current || !target) return;
      if (panelRef.current.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClick, true);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + offset;
  // Clamp left so the panel doesn't run past the viewport.
  const left = Math.min(rect.left, window.innerWidth - width - 8);

  return (
    <div
      ref={panelRef}
      role="dialog"
      style={{
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 60,
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        boxShadow: 'var(--xp-shadow-3)',
        padding: 4,
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12,
        color: 'var(--xp-ink)',
      }}
    >
      {children}
    </div>
  );
}

export interface CellPopoverOptionProps {
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

/**
 * Single row inside a CellPopover. Use for picker options.
 */
export function CellPopoverOption({ selected, onSelect, children }: CellPopoverOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        border: 0,
        background: 'transparent',
        color: 'var(--xp-ink)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12,
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 'var(--xp-r-sm)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--xp-layer)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {children}
      </span>
      {selected && <span style={{ color: 'var(--xp-accent-strong)' }}>✓</span>}
    </button>
  );
}
