// packages/ui/src/primitives/Checkbox.tsx
//
// Off / on / mixed / disabled. Strategy B: bg = --xp-accent (cadmium yellow
// fill), border = --xp-accent-strong (mustard), check stroke = --xp-accent-fg.
// For dark-enough accents these all converge on the bright accent + white check.

import type { ChangeEvent, ReactNode } from 'react';

export interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  label?: ReactNode;
  disabled?: boolean;
}

export function Checkbox({
  checked = false, indeterminate = false, onChange, label, disabled,
}: CheckboxProps) {
  const filled = checked || indeterminate;
  return (
    <label
      className={`inline-flex items-center gap-[8px] text-[12.5px] font-mono ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center w-[14px] h-[14px] rounded-xp-sm transition-all duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)] ${
          filled
            ? 'border border-xp-accent-strong bg-xp-accent'
            : 'border border-xp-input bg-xp-surface'
        }`}
      >
        {checked && !indeterminate && (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 5 L4 7 L8 3" fill="none"
                  stroke="var(--xp-accent-fg)" strokeWidth="1.6" strokeLinecap="square" />
          </svg>
        )}
        {indeterminate && (
          <span className="w-[7px] h-[1.5px] bg-[var(--xp-accent-fg)]" />
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="absolute opacity-0 pointer-events-none"
      />
      {label && <span>{label}</span>}
    </label>
  );
}
