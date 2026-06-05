import { MutationQueue, type QueuedMutation, RetryableError } from '@xpntl/sync-engine';
import { create } from 'zustand';
import { FetchError, api } from './api';
import { useAuth } from './auth-store';

/**
 * Offline mutation queue wiring (XP-3 Phase 2).
 *
 * Edits to existing issues are applied optimistically in the UI and enqueued
 * here; the queue persists them (IndexedDB) and delivers in order, surviving
 * reload and offline. Reconcile-on-ack is handled by op-apply: the server
 * mutation emits an op that the originator's own sync connection receives, which
 * refetches the canonical issue — so the queue itself is fire-and-forget.
 *
 * Scope: edits to *existing* issues (stable key). Offline *creation* is not
 * queued — it needs temp-id reconciliation and still goes straight to the
 * server (failing loudly if offline).
 */

type IssueUpdatePatch = Parameters<typeof api.updateIssue>[1];

export type QueueState = {
  pending: number;
  flushing: boolean;
  /** Bumped when a mutation is dropped permanently — views refetch to undo the optimistic edit. */
  dropRev: number;
};

export const useMutationQueue = create<QueueState>(() => ({
  pending: 0,
  flushing: false,
  dropRev: 0,
}));

/** Classify a failed request: 4xx (except 408/429) is permanent; everything else retries. */
function isPermanent(err: unknown): boolean {
  return (
    err instanceof FetchError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 408 &&
    err.status !== 429
  );
}

async function send(m: QueuedMutation): Promise<void> {
  const token = useAuth.getState().token;
  if (!token) throw new RetryableError('no session'); // pause until signed in

  try {
    if (m.kind === 'issue.update') {
      const { key, patch } = m.args as { key: string; patch: IssueUpdatePatch };
      await api.updateIssue(key, patch, token);
    } else if (m.kind === 'issue.archive') {
      const { key } = m.args as { key: string };
      await api.archiveIssue(key, token);
    } else if (m.kind === 'issue.setAssignees') {
      const { key, userIds } = m.args as { key: string; userIds: string[] };
      await api.setAssignees(key, userIds, token);
    }
    // Unknown kinds resolve silently (forward-compat with persisted items).
  } catch (err) {
    if (isPermanent(err)) throw err; // drop
    throw new RetryableError(); // network / 5xx / 408 / 429 → keep + retry
  }
}

const queue = new MutationQueue({
  send,
  onChange: (state) => useMutationQueue.setState(state),
  onDrop: (_m, err) => {
    useMutationQueue.setState((s) => ({ dropRev: s.dropRev + 1 }));
    const msg = err instanceof FetchError ? err.message : 'change could not be saved';
    // Surfaced via the toast store lazily to avoid an import cycle.
    import('./toast-store')
      .then(({ useToasts }) =>
        useToasts.getState().push('danger', `Discarded a queued change — ${msg}`),
      )
      .catch(() => {});
  },
});

let initialized = false;
export function initMutationQueue(): void {
  if (initialized) return;
  initialized = true;
  void queue.init();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void queue.flush());
  }
}

/** Retry delivery now (call on sync reconnect / coming back online). */
export function flushMutationQueue(): void {
  void queue.flush();
}

export function enqueueIssueUpdate(key: string, patch: IssueUpdatePatch): void {
  void queue.enqueue('issue.update', { key, patch });
}

export function enqueueIssueArchive(key: string): void {
  void queue.enqueue('issue.archive', { key });
}

export function enqueueIssueSetAssignees(key: string, userIds: string[]): void {
  void queue.enqueue('issue.setAssignees', { key, userIds });
}
