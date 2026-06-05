// packages/ui/src/primitives/Toast.tsx
//
// Single toast notification. Kind sets a 2px leading accent bar.
// For stacking / queue / timing, wire to a toast manager (sonner, etc).

import type { ReactNode } from 'react';

export type ToastKind = 'info' | 'success' | 'warn' | 'danger';

export interface ToastProps {
  kind?: ToastKind;
  title: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
}

const ACCENT: Record<ToastKind, string> = {
  info:    'bg-xp-info',
  success: 'bg-xp-success',
  warn:    'bg-xp-warn',
  danger:  'bg-xp-danger',
};

export function Toast({ kind = 'info', title, action, onClose }: ToastProps) {
  return (
    <div className="flex items-center gap-[10px] py-[8px] px-[12px] min-w-[280px] max-w-[420px] bg-xp-surface text-xp-ink border border-xp-border rounded-xp-sm shadow-xp-2 relative">
      <span className={`absolute left-0 top-0 bottom-0 w-[2px] ${ACCENT[kind]}`} />
      <span className="text-[12.5px] flex-1">{title}</span>
      {action}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="bg-transparent border-0 text-xp-muted cursor-pointer font-mono text-[11px]"
        >×</button>
      )}
    </div>
  );
}
