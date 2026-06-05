// apps/web/src/components/ThemeToggle.tsx
//
// PER-100 — Three-segment theme switcher (light / system / dark). Lives in
// the sidebar footer. Inline SVG icons; the active segment renders with
// accent-strong stroke + accent-tint background.

import { type ThemeMode, useTheme } from '../lib/theme';

const ICON_SIZE = 12;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);

  if (compact) {
    // In collapsed sidebar render just the active mode's icon as a button
    // that cycles light → system → dark on click.
    const next: ThemeMode = mode === 'light' ? 'system' : mode === 'system' ? 'dark' : 'light';
    return (
      <button
        type="button"
        onClick={() => setMode(next)}
        title={`Theme: ${mode} (click to cycle)`}
        aria-label="Cycle theme"
        style={btnStyle(true)}
      >
        <ThemeIcon mode={mode} />
      </button>
    );
  }

  const items: Array<{ mode: ThemeMode; label: string }> = [
    { mode: 'light', label: 'Light' },
    { mode: 'system', label: 'System' },
    { mode: 'dark', label: 'Dark' },
  ];

  return (
    <div
      role="group"
      aria-label="Theme"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 2,
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        background: 'var(--xp-surface)',
      }}
    >
      {items.map((it) => {
        const active = it.mode === mode;
        return (
          <button
            key={it.mode}
            type="button"
            onClick={() => setMode(it.mode)}
            title={it.label}
            aria-label={`Theme: ${it.label}`}
            aria-pressed={active}
            style={{
              ...btnStyle(false),
              background: active ? 'var(--xp-accent-tint)' : 'transparent',
              color: active ? 'var(--xp-accent-strong)' : 'var(--xp-muted)',
            }}
          >
            <ThemeIcon mode={it.mode} />
          </button>
        );
      })}
    </div>
  );
}

function btnStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: compact ? 22 : 20,
    height: compact ? 22 : 18,
    padding: 0,
    border: compact ? '1px solid var(--xp-border)' : 0,
    borderRadius: 'var(--xp-r-sm)',
    cursor: 'pointer',
    color: 'var(--xp-muted)',
    background: 'transparent',
    fontFamily: 'var(--xp-font-mono)',
  };
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  const props = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: '0 0 12 12',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (mode === 'light') {
    return (
      <svg {...props} role="img" aria-label="Light">
        <title>Light</title>
        <circle cx="6" cy="6" r="2.2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const r = 3.6;
          const r2 = 4.8;
          const a = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={6 + Math.cos(a) * r}
              y1={6 + Math.sin(a) * r}
              x2={6 + Math.cos(a) * r2}
              y2={6 + Math.sin(a) * r2}
            />
          );
        })}
      </svg>
    );
  }
  if (mode === 'dark') {
    return (
      <svg {...props} role="img" aria-label="Dark">
        <title>Dark</title>
        <path d="M9 7.5 A 4 4 0 1 1 4.5 3 a 3 3 0 0 0 4.5 4.5 z" />
      </svg>
    );
  }
  return (
    <svg {...props} role="img" aria-label="System">
      <title>System</title>
      <circle cx="6" cy="6" r="4" />
      <path d="M6 2 A 4 4 0 0 1 6 10 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
