// packages/ui/src/primitives/Input.tsx
//
// Text input with optional leading + trailing slots (e.g. ⌕ icon, ⌘K kbd).
// Focus ring driven by CSS focus-within — no JS state needed.

import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md';
  /** React 19 ref-as-prop forwarded to the underlying `<input>`. */
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  leading,
  trailing,
  size = 'md',
  disabled,
  style,
  className,
  ref,
  ...rest
}: InputProps) {
  const h = size === 'sm' ? 'h-[var(--xp-btn-h-sm)]' : 'h-[var(--xp-input-h)]';
  return (
    <label
      className={`inline-flex items-center gap-[8px] px-[10px] w-full rounded-xp-sm bg-xp-surface border border-xp-input outline-none transition-[box-shadow,border-color] duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)] focus-within:shadow-[var(--xp-focus-ring)] focus-within:border-[var(--xp-focus-border)] ${h} ${disabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={style}
    >
      {leading && (
        <span className="text-xp-muted inline-flex">{leading}</span>
      )}
      <input
        ref={ref}
        type="text"
        disabled={disabled}
        className="flex-1 border-0 outline-0 bg-transparent font-mono text-[12.5px] text-xp-ink tracking-[var(--xp-track-snug)] min-w-0"
        {...rest}
      />
      {trailing && (
        <span className="text-xp-muted inline-flex">{trailing}</span>
      )}
    </label>
  );
}
