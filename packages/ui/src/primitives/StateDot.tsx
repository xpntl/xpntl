// packages/ui/src/primitives/StateDot.tsx
//
// Six workflow states drawn as small SVG icons. Color comes from
// --xp-st-{kind} tokens; for "started" the stroke uses --xp-accent-strong
// so the two-tone yellow case (Strategy B) reads on cream.

export type WorkflowState =
  | 'triage' | 'backlog' | 'unstarted'
  | 'started' | 'review' | 'completed' | 'canceled';

export interface StateDotProps {
  kind?: WorkflowState;
  size?: number;
  /** Override color (defaults to the kind's token). */
  color?: string;
  /** Hover tooltip; defaults to a readable label for the kind. */
  title?: string;
}

const STATE_DOT_LABEL: Record<WorkflowState, string> = {
  triage: 'Triage',
  backlog: 'Backlog',
  unstarted: 'Ready',
  started: 'In progress',
  review: 'In review',
  completed: 'Done',
  canceled: 'Canceled',
};

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const sa = (startDeg - 90) * Math.PI / 180;
  const ea = (endDeg - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
  const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function StateDot({ kind = 'unstarted', size = 14, color, title }: StateDotProps) {
  const c = color ?? `var(--xp-st-${kind})`;
  const s = size, sw = 1.2;
  const common = {
    width: s, height: s, viewBox: `0 0 ${s} ${s}`,
    className: 'flex-none',
    style: { color: c } as const,
  };
  const tip = title ?? `State: ${STATE_DOT_LABEL[kind]}`;
  const glyph = (() => {
    switch (kind) {
    case 'triage':
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={s/2 - 1.2} fill="none" stroke={c} strokeWidth={sw} strokeDasharray="2.2 1.8" />
        </svg>
      );
    case 'backlog':
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={s/2 - 1.2} fill="none" stroke={c} strokeWidth={sw} />
        </svg>
      );
    case 'unstarted': {
      // "Ready" — 25% filled
      const r = s/2 - 1.2;
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={c} strokeWidth={sw} />
          <path d={describeArc(s/2, s/2, r - 0.4, 0, 90)} fill={c} />
        </svg>
      );
    }
    case 'started': {
      const r = s/2 - 1.2;
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={r} fill="none" stroke="var(--xp-accent-strong)" strokeWidth={sw} />
          <path d={describeArc(s/2, s/2, r - 0.4, 0, 216)} fill={c} />
        </svg>
      );
    }
    case 'review': {
      // 75% filled
      const r = s/2 - 1.2;
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={c} strokeWidth={sw} />
          <path d={describeArc(s/2, s/2, r - 0.4, 0, 270)} fill={c} />
        </svg>
      );
    }
    case 'completed':
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={s/2 - 0.5} fill={c} />
          <path d={`M${s*0.28} ${s*0.52} L${s*0.45} ${s*0.68} L${s*0.74} ${s*0.36}`}
                fill="none" stroke="var(--xp-accent-fg)" strokeWidth="1.5"
                strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      );
    case 'canceled':
      return (
        <svg {...common}>
          <circle cx={s/2} cy={s/2} r={s/2 - 1.2} fill="none" stroke={c} strokeWidth={sw} />
          <line x1={s*0.28} y1={s/2} x2={s*0.72} y2={s/2} stroke={c} strokeWidth={sw} />
        </svg>
      );
    }
  })();
  return (
    <span title={tip} aria-label={tip} className="inline-flex flex-none">
      {glyph}
    </span>
  );
}
