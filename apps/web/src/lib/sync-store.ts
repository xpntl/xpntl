import { SyncClient, type SyncOp, type SyncStatus } from '@xpntl/sync-engine';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { api } from './api';
import { useAuth } from './auth-store';
import { flushMutationQueue, initMutationQueue } from './mutation-queue-store';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/**
 * Real-time sync (XP-3 Phase 1). A single SyncClient streams op-log entries from
 * the gateway; we surface per-entity "revision" counters that views subscribe to
 * and use to silently refetch. (Phase 2 will apply ops to a local store directly
 * instead of refetching.)
 */
type SyncState = {
  status: SyncStatus;
  /** Bumped on every issue op — views key a debounced refetch off this. */
  issueRev: number;
  /** Bumped on every project op — the project store refreshes off this. */
  projectRev: number;
  lastOp: SyncOp | null;
  /** Presence: issueId → distinct userIds currently viewing it. */
  viewers: Record<string, string[]>;
};

export const useSyncStore = create<SyncState>(() => ({
  status: 'closed',
  issueRev: 0,
  projectRev: 0,
  lastOp: null,
  viewers: {},
}));

/** Announce (or clear) which issue the current user is viewing, for presence. */
export function setViewingIssue(issueId: string | null): void {
  client?.setPresence(issueId);
}

let client: SyncClient | null = null;
let activeToken: string | null = null;

function startSync(token: string): void {
  if (client && activeToken === token) return;
  stopSync();
  activeToken = token;
  client = new SyncClient({
    url: API_URL,
    // Mint a fresh single-use ticket per connect — the long-lived session token
    // never travels in the WS URL.
    getTicket: () =>
      api
        .createSyncTicket(token)
        .then((r) => r.ticket)
        .catch(() => null),
    onStatus: (status) => {
      useSyncStore.setState({ status });
      // On (re)connect, drain any mutations queued while offline.
      if (status === 'open') flushMutationQueue();
    },
    onOp: (op) => {
      useSyncStore.setState((s) => ({
        lastOp: op,
        issueRev: op.entityType === 'issue' ? s.issueRev + 1 : s.issueRev,
        projectRev: op.entityType === 'project' ? s.projectRev + 1 : s.projectRev,
      }));
    },
    onPresence: (viewers) => useSyncStore.setState({ viewers }),
  });
  client.connect();
}

function stopSync(): void {
  client?.disconnect();
  client = null;
  activeToken = null;
  useSyncStore.setState({ status: 'closed', viewers: {} });
}

/** The *other* users currently viewing `issueId` (excludes the current user). */
export function usePresenceViewers(issueId: string | null | undefined): string[] {
  const viewers = useSyncStore((s) => (issueId ? s.viewers[issueId] : undefined));
  const myId = useAuth((s) => s.user?.id ?? null);
  return useMemo(() => (viewers ?? []).filter((id) => id !== myId), [viewers, myId]);
}

/**
 * Mount once (in AppLayout) to keep a live sync connection for the signed-in
 * workspace. Reconnects when the session token changes; disconnects on sign-out.
 */
export function useSyncConnection(): void {
  const token = useAuth((s) => s.token);
  const workspaceId = useAuth((s) => s.workspace?.id ?? null);

  useEffect(() => {
    if (!token || !workspaceId) {
      stopSync();
      return;
    }
    initMutationQueue(); // replay anything persisted from a previous session
    startSync(token);
    // Don't tear down on every dep change — only when token/workspace truly
    // changes (startSync no-ops if the token is unchanged).
  }, [token, workspaceId]);
}
