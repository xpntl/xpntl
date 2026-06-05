// Shared visual system for the issue "Overview" meta card, used by BOTH the
// full IssueDetail sidebar and the IssuePeek slide-over so they render
// identically: left-aligned label column, equal-height rows, and a clear
// at-rest affordance that distinguishes editable fields from read-only text.

import type { CSSProperties, ReactNode } from 'react';

// Width of the label column. One value, two consumers — keeps them aligned.
export const OVERVIEW_LABEL_COL = 80;

// One row of the overview grid. Fixed min-height keeps every row the same
// height regardless of whether the value is text, an avatar, or a control.
export const overviewRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `${OVERVIEW_LABEL_COL}px 1fr`,
  columnGap: 10,
  alignItems: 'center',
  minHeight: 32,
  fontSize: 12,
  padding: '0 6px',
  borderRadius: 'var(--xp-r-sm)',
};

// The label cell. Vertically centered so it aligns with the value control.
export const overviewLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 26,
};

// Read-only value (Creator, Created, Updated…). Plain text — intentionally
// NOT boxed, so the contrast with editable fields signals what can change.
export const overviewReadonlyStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 26,
  color: 'var(--xp-ink)',
};

// Editable value at rest. Reads as a control — subtle border, canvas fill,
// trailing chevron — so it's obviously interactive rather than text on white.
export const overviewEditableStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  width: '100%',
  minHeight: 26,
  padding: '2px 8px',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  cursor: 'pointer',
  textAlign: 'left',
};

// Wraps an editable value's content with the control affordance + chevron.
// Hover state lives in index.css (.xp-editable-value:hover).
export function EditableValue({
  children,
  muted,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className="xp-editable-value"
      style={{ ...overviewEditableStyle, color: muted ? 'var(--xp-muted)' : 'var(--xp-ink)' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--xp-faint)', fontSize: 10, lineHeight: 1 }}>
        ⌄
      </span>
    </span>
  );
}
