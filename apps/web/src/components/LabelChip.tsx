// apps/web/src/components/LabelChip.tsx
//
// PER-43 — Visual chip for a workspace label. Small color dot + name. Sits
// on issue rows, peek meta panel, and detail body. The chip is decorative
// here; clicking is handled by the LabelPicker mounted at the row.

import type { Label } from '../lib/api';

interface LabelChipProps {
  label: Label;
  size?: 'sm' | 'md';
}

export function LabelChip({ label, size = 'sm' }: LabelChipProps) {
  return (
    <span
      title={`Label: ${label.name}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-pill)',
        background: 'var(--xp-surface)',
        color: 'var(--xp-ink)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: size === 'sm' ? 10.5 : 11.5,
        letterSpacing: 'var(--xp-track-snug)',
        lineHeight: 1.25,
        maxWidth: 140,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: label.color,
          flex: 'none',
        }}
      />
      {label.name}
    </span>
  );
}
