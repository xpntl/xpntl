// XP-88 Issue type icons. Each built-in type renders a small, theme-aware glyph
// that identifies the issue throughout the UI (board cards, peek, detail).
// Mirrors the domain catalog (@xpntl/domain ISSUE_TYPES).

import type { CSSProperties } from 'react';

export const ISSUE_TYPE_META: Record<
  string,
  { label: string; color: string; glyph: string }
> = {
  issue: { label: 'Issue', color: 'var(--xp-muted)', glyph: '◆' },
  task: { label: 'Task', color: 'oklch(62% 0.14 250)', glyph: '✓' },
  bug: { label: 'Bug', color: 'oklch(60% 0.20 25)', glyph: '●' },
  feature: { label: 'Feature', color: 'oklch(62% 0.17 300)', glyph: '✦' },
  epic: { label: 'Epic', color: 'oklch(60% 0.17 280)', glyph: '◈' },
  story: { label: 'Story', color: 'oklch(64% 0.15 150)', glyph: '▣' },
  research: { label: 'Research', color: 'oklch(66% 0.13 210)', glyph: '◎' },
};

export function issueTypeLabel(type: string): string {
  return ISSUE_TYPE_META[type]?.label ?? type;
}

// Select options in catalog order — mirrors @xpntl/domain ISSUE_TYPES.
export const ISSUE_TYPE_OPTIONS = Object.entries(ISSUE_TYPE_META).map(([value, m]) => ({
  value,
  label: m.label,
}));

export function IssueTypeIcon({
  type,
  size = 13,
  style,
}: {
  type: string;
  size?: number;
  style?: CSSProperties;
}) {
  const meta = ISSUE_TYPE_META[type] ?? ISSUE_TYPE_META.issue!;
  return (
    <span
      title={`Type: ${meta.label}`}
      aria-label={`Issue type: ${meta.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: size,
        lineHeight: 1,
        color: meta.color,
        flexShrink: 0,
        ...style,
      }}
    >
      {meta.glyph}
    </span>
  );
}
