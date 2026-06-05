// packages/ui/src/primitives/Priority.tsx
//
// Five priority levels as a descending bar-chart glyph.
// Urgent: solid stripe + dot. None: single muted line.

export type PriorityLevel = 'urgent' | 'high' | 'normal' | 'low' | 'none';

export interface PriorityProps {
  kind?: PriorityLevel;
  size?: number;
  /** Hover tooltip; defaults to a readable label for the level. */
  title?: string;
}

const PRIORITY_LEVEL_LABEL: Record<PriorityLevel, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
  none: 'No priority',
};

const HEIGHTS: Record<Exclude<PriorityLevel, 'urgent' | 'none'>, number[]> = {
  high:   [4, 7, 11, 0.25],
  normal: [4, 9, 0.25, 0.25],
  low:    [6, 0.25, 0.25, 0.25],
};

export function Priority({ kind = 'normal', size = 14, title }: PriorityProps) {
  const color = `var(--xp-pri-${kind})`;
  const tip = title ?? `Priority: ${PRIORITY_LEVEL_LABEL[kind]}`;
  const glyph = (() => {
    if (kind === 'none') {
      return (
        <svg width={size} height={size} viewBox="0 0 14 14"
             className="shrink-0" style={{ color }}>
          <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    }
    if (kind === 'urgent') {
      return (
        <svg width={size} height={size} viewBox="0 0 14 14"
             className="shrink-0" style={{ color }}>
          <rect x="6" y="2"  width="2.2" height="7" fill="currentColor" />
          <rect x="6" y="10" width="2.2" height="2" fill="currentColor" />
        </svg>
      );
    }
    const hs = HEIGHTS[kind];
    return (
      <svg width={size} height={size} viewBox="0 0 14 14"
           className="shrink-0" style={{ color }}>
        {[0, 1, 2, 3].map(i => {
          const h = hs[i]!;
          const op = h <= 1 ? 0.25 : 1;
          const hh = h <= 1 ? 14 : h;
          return (
            <rect key={i} x={1.5 + i * 3} y={14 - hh} width="2.2" height={hh}
                  fill="currentColor" opacity={op} />
          );
        })}
      </svg>
    );
  })();
  return (
    <span title={tip} aria-label={tip} className="inline-flex shrink-0">
      {glyph}
    </span>
  );
}
