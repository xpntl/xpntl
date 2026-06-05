// apps/web/src/components/ShortcutSheet.tsx
//
// PER-111 — Keyboard shortcut cheat-sheet overlay. Opened on `?`. Lists every
// shortcut wired in the app, sectioned and Kbd-rendered.

import { Dialog, Kbd } from '@xpntl/ui';

interface ShortcutSheetProps {
  open: boolean;
  onClose: () => void;
}

// Match the modifier the shortcut layer actually binds (cmd on Mac, ctrl elsewhere).
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutSection {
  heading: string;
  rows: ShortcutRow[];
}

const SECTIONS: ShortcutSection[] = [
  {
    heading: 'GLOBAL',
    rows: [
      { keys: [MOD, 'K'], label: 'Open command palette' },
      { keys: [MOD, '\\'], label: 'Toggle sidebar' },
      { keys: ['G', 'I'], label: 'Go to Inbox' },
      { keys: ['G', 'M'], label: 'Go to My issues' },
      { keys: ['G', 'A'], label: 'Go to Active' },
      { keys: ['G', 'B'], label: 'Go to Backlog' },
      { keys: ['G', 'L'], label: 'Go to All issues' },
      { keys: ['G', 'P'], label: 'Go to Projects' },
      { keys: ['G', 'S'], label: 'Go to Settings' },
      { keys: ['?'], label: 'Show this sheet' },
    ],
  },
  {
    heading: 'LIST',
    rows: [
      { keys: ['J'], label: 'Focus next row' },
      { keys: ['K'], label: 'Focus previous row' },
      { keys: ['Enter'], label: 'Open focused issue (slide-over peek)' },
      { keys: ['E'], label: 'Open focused issue (alias)' },
      { keys: ['X'], label: 'Toggle selection on focused row' },
      { keys: ['S'], label: 'Change state on focused row' },
      { keys: ['P'], label: 'Change priority on focused row' },
      { keys: ['A'], label: 'Change assignee on focused row' },
      { keys: ['L'], label: 'Change labels on focused row' },
      { keys: ['Esc'], label: 'Clear selection / close peek' },
      { keys: ['C'], label: 'New issue' },
      { keys: ['/'], label: 'Focus search' },
    ],
  },
  {
    heading: 'TRIAGE (Inbox only)',
    rows: [
      { keys: ['T'], label: 'Accept → Backlog' },
      { keys: ['S'], label: 'Start now' },
      { keys: ['D'], label: 'Decline' },
    ],
  },
  {
    heading: 'EDITOR',
    rows: [
      { keys: [MOD, 'Enter'], label: 'Save description / comment' },
      { keys: ['Esc'], label: 'Cancel edit' },
    ],
  },
];

export function ShortcutSheet({ open, onClose }: ShortcutSheetProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <div className="xp-meta" style={{ marginBottom: 10, color: 'var(--xp-muted)' }}>
              {section.heading}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                rowGap: 8,
                columnGap: 14,
                fontFamily: 'var(--xp-font-mono)',
              }}
            >
              {section.rows.map((row) => (
                <ShortcutRowView key={row.label} row={row} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function ShortcutRowView({ row }: { row: ShortcutRow }) {
  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {row.keys.map((k, i) => (
          <span
            key={`${row.label}-${i}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Kbd size="sm">{k}</Kbd>
            {i < row.keys.length - 1 && (
              <span style={{ color: 'var(--xp-faint)', fontSize: 10 }}>then</span>
            )}
          </span>
        ))}
      </span>
      <span style={{ fontSize: 12, color: 'var(--xp-ink)' }}>{row.label}</span>
    </>
  );
}
