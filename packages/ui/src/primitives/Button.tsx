// packages/ui/src/primitives/Button.tsx
//
// Primary / secondary / ghost / danger. Sizes sm / md. Leading + trailing slots.
// Primary uses --xp-primary-* so it falls back to outline when the accent is
// too light to carry white text (yellow case).

import type { ReactNode, ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--xp-primary-bg)] text-[var(--xp-primary-fg)] border border-[var(--xp-primary-border)]',
    'hover:border-[var(--xp-accent-strong)]',
  ].join(' '),
  secondary: 'bg-xp-surface text-xp-ink border border-xp-border hover:bg-xp-layer',
  ghost: 'bg-transparent text-xp-ink border border-transparent hover:bg-xp-layer',
  danger: 'bg-xp-danger text-[oklch(98%_0.005_60)] border border-xp-danger hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-[var(--xp-btn-h-sm)] px-[8px] text-[11px]',
  md: 'h-[var(--xp-btn-h)] px-[12px] text-[12px]',
};

export function Button({
  children, variant = 'secondary', size = 'md',
  leading, trailing, disabled, style, className, ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center gap-[6px] rounded-xp-sm font-mono font-medium tracking-[var(--xp-track-wide)] uppercase outline-none cursor-pointer transition-[box-shadow,border-color] duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)] focus:shadow-[var(--xp-focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
      style={style}
      {...rest}
    >
      {leading && <span className="inline-flex">{leading}</span>}
      <span>{children}</span>
      {trailing && <span className="inline-flex opacity-80">{trailing}</span>}
    </button>
  );
}
