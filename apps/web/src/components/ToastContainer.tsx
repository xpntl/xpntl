// apps/web/src/components/ToastContainer.tsx
//
// Fixed-position toast stack. Renders in the bottom-right corner.
// Each toast slides in, then auto-dismisses via the store timer.

import { Toast } from '@xpntl/ui';
import { useToasts } from '../lib/toast-store';

export function ToastContainer() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            animation: 'xp-slide-in-bottom var(--xp-dur-base, 180ms) var(--xp-ease, ease-out)',
          }}
        >
          <Toast kind={t.kind} title={t.title} onClose={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
