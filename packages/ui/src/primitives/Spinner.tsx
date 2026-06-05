// packages/ui/src/primitives/Spinner.tsx
//
// Dashed ring rotating. Default color = accent. Size controls bounding box.
// Pass `label` for the standard inline "spinner + text" loading row.

export interface SpinnerProps {
  size?: number;
  color?: string;
  label?: string;
}

export function Spinner({ size = 14, color = 'var(--xp-accent-strong)', label }: SpinnerProps) {
  const ring = (
    <svg width={size} height={size} viewBox="0 0 14 14"
         className="animate-xp-spin shrink-0">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5"
              strokeLinecap="square" strokeDasharray="3 5" />
    </svg>
  );

  if (!label) return ring;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12,
        color: 'var(--xp-muted)',
      }}
    >
      {ring}
      {label}
    </span>
  );
}
