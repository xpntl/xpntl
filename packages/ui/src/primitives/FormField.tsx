import type { ReactNode } from 'react';

export interface FormFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-[4px]">
      {label && (
        <span className="text-[11px] text-xp-muted font-mono tracking-[var(--xp-track-wide)] uppercase font-medium">
          {label}
          {required && <span className="text-xp-danger ml-[2px]">*</span>}
        </span>
      )}
      {children}
      {error && (
        <span className="text-[11px] text-xp-danger font-mono">{error}</span>
      )}
      {!error && hint && (
        <span className="text-[10px] text-xp-faint font-mono">{hint}</span>
      )}
    </div>
  );
}
