// packages/ui/src/primitives/Radio.tsx

import type { ChangeEvent, ReactNode } from 'react';

export interface RadioProps {
  checked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  label?: ReactNode;
  name?: string;
  disabled?: boolean;
  value?: string;
}

export function Radio({ checked = false, onChange, label, name, disabled, value }: RadioProps) {
  return (
    <label
      className={`inline-flex items-center gap-[8px] text-[12.5px] font-mono ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center w-[14px] h-[14px] rounded-xp-pill bg-xp-surface ${
          checked ? 'border border-xp-accent-strong' : 'border border-xp-input'
        }`}
      >
        {checked && (
          <span className="w-[6px] h-[6px] rounded-xp-pill bg-xp-accent-strong" />
        )}
      </span>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="absolute opacity-0 pointer-events-none"
      />
      {label && <span>{label}</span>}
    </label>
  );
}
