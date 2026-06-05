import type { ViewKey } from '../lib/filter-url';

const ICON = 14;

type ViewTab = {
  key: ViewKey;
  label: string;
  icon: React.ReactNode;
};

const TABS: ViewTab[] = [
  { key: 'list', label: 'List', icon: <ListIcon /> },
  { key: 'board', label: 'Board', icon: <BoardIcon /> },
  { key: 'roadmap', label: 'Timeline', icon: <RoadmapIcon /> },
];

export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="View mode"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        borderBottom: '1px solid var(--xp-hairline)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12.5,
        paddingLeft: 4,
      }}
    >
      {TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: 34,
              border: 'none',
              borderBottom: active ? '2px solid var(--xp-accent-strong)' : '2px solid transparent',
              marginBottom: -1,
              background: 'transparent',
              cursor: 'pointer',
              color: active ? 'var(--xp-ink)' : 'var(--xp-muted)',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: active ? 600 : 400,
              transition:
                'color var(--xp-dur-base) var(--xp-ease), border-color var(--xp-dur-base) var(--xp-ease)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                color: active ? 'var(--xp-accent-strong)' : 'var(--xp-muted)',
              }}
            >
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      width={ICON}
      height={ICON}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
    >
      <line x1="2" y1="3.5" x2="12" y2="3.5" />
      <line x1="2" y1="7" x2="12" y2="7" />
      <line x1="2" y1="10.5" x2="12" y2="10.5" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg
      aria-hidden="true"
      width={ICON}
      height={ICON}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="2" width="3" height="10" rx="0.5" />
      <rect x="5.5" y="2" width="3" height="7" rx="0.5" />
      <rect x="9.5" y="2" width="3" height="8.5" rx="0.5" />
    </svg>
  );
}

function RoadmapIcon() {
  return (
    <svg
      aria-hidden="true"
      width={ICON}
      height={ICON}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
    >
      <rect x="3" y="2" width="7" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="1" y="6" width="6" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="4.5" y="10" width="8" height="2.5" rx="0.5" fill="currentColor" />
    </svg>
  );
}
