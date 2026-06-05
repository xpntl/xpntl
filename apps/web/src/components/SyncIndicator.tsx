import { useMutationQueue } from '../lib/mutation-queue-store';
import { useSyncStore } from '../lib/sync-store';

/**
 * Tiny ambient sync status (XP-3 Phase 2). Stays out of the way: only renders
 * when the connection is down or there are mutations still in flight/queued.
 */
export function SyncIndicator() {
  const status = useSyncStore((s) => s.status);
  const pending = useMutationQueue((s) => s.pending);

  const offline = status !== 'open';
  if (!offline && pending === 0) return null;

  let label: string;
  let dot: string;
  if (offline && pending > 0) {
    label = `Offline · ${pending} change${pending === 1 ? '' : 's'} saved locally`;
    dot = 'oklch(70% 0.16 60)'; // amber
  } else if (offline) {
    label = 'Reconnecting…';
    dot = 'var(--xp-faint)';
  } else {
    label = `Syncing ${pending}…`;
    dot = 'var(--xp-accent-strong)';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 11,
        color: 'var(--xp-ink)',
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-pill, 999px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dot,
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}
