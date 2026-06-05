// packages/ui/src/primitives/Progress.tsx
//
// Thin progress bar. Track + fill with smooth width transition.
// Tone maps to semantic colors.

export interface ProgressProps {
  value: number; // 0-100
  tone?: 'accent' | 'success' | 'danger' | 'warn';
  size?: 'sm' | 'md';
}

const TONE_CLASSES: Record<NonNullable<ProgressProps['tone']>, string> = {
  accent:  'bg-xp-accent',
  success: 'bg-xp-success',
  danger:  'bg-xp-danger',
  warn:    'bg-xp-warn',
};

export function Progress({
  value,
  tone = 'accent',
  size = 'md',
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const h = size === 'sm' ? 'h-[2px]' : 'h-[4px]';

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full rounded-xp-pill bg-xp-layer overflow-hidden ${h}`}
    >
      <div
        className={`${h} rounded-xp-pill transition-[width] duration-[var(--xp-dur-base)] ease-[var(--xp-ease)] ${TONE_CLASSES[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
