import type { ChangeEvent, ReactNode } from 'react';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  label?: ReactNode;
  disabled?: boolean;
}

export function Switch({ checked = false, onChange, label, disabled }: SwitchProps) {
  return (
    <label
      className={`inline-flex items-center gap-[10px] font-mono text-[12.5px] select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden
        className="relative inline-block w-[30px] h-[16px] rounded-full shrink-0 transition-[background,border-color] duration-[120ms] ease-out"
        style={{
          background: checked ? 'var(--xp-accent)' : 'var(--xp-input)',
          border: `1px solid ${checked ? 'var(--xp-accent-strong)' : 'var(--xp-border)'}`,
        }}
      >
        <span
          className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-[left] duration-[120ms] ease-out"
          style={{ left: checked ? 14 : 2 }}
        />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
