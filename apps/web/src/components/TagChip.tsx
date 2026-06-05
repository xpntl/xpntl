// apps/web/src/components/TagChip.tsx
//
// Visual chip for a workspace tag. Small color dot + name, matching the
// LabelChip pattern. Displayed on issue rows, peek meta panel, and detail.

import type { Tag } from '../lib/api';

interface TagChipProps {
  tag: Tag;
  size?: 'sm' | 'md';
}

export function TagChip({ tag, size = 'sm' }: TagChipProps) {
  return (
    <span
      title={`Tag: ${tag.name}`}
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
          borderRadius: 2,
          background: tag.color,
          flex: 'none',
        }}
      />
      {tag.name}
    </span>
  );
}
