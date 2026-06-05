// apps/web/src/lib/issue-ref-cache.ts
//
// Lightweight cache for issue summary data used by hover previews.
// Entries expire after 60 seconds to keep previews reasonably fresh
// without hammering the API on repeated hovers.

import type { Issue, WorkflowState } from './api';
import { api } from './api';
import { useAuth } from './auth-store';

export type IssueSummary = {
  key: string;
  title: string;
  stateId: string;
  stateName: string;
  stateType: WorkflowState['type'];
  priority: number;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  assigneeIsAgent?: boolean;
  assigneeHarness?: string | null;
};

type CacheEntry = {
  data: IssueSummary | null;
  error: string | null;
  fetchedAt: number;
  promise?: Promise<IssueSummary | null>;
};

const cache = new Map<string, CacheEntry>();
const TTL = 60_000; // 60s

let statesCache: WorkflowState[] | null = null;
let statesFetchPromise: Promise<WorkflowState[]> | null = null;

async function getStates(token: string | null): Promise<WorkflowState[]> {
  if (statesCache) return statesCache;
  if (statesFetchPromise) return statesFetchPromise;
  statesFetchPromise = api.listWorkflowStates(token).then((r) => {
    statesCache = r.states;
    return r.states;
  });
  return statesFetchPromise;
}

/**
 * Fetch (or return cached) issue summary by key.
 * Returns null if the issue doesn't exist or request fails.
 */
export async function fetchIssueSummary(
  issueKey: string,
  token: string | null,
  usersById: Record<string, { displayName: string | null; email: string; avatarUrl?: string | null; isAgent?: boolean; agentHarness?: string | null }>,
): Promise<IssueSummary | null> {
  const existing = cache.get(issueKey);
  if (existing && Date.now() - existing.fetchedAt < TTL) {
    if (existing.promise) return existing.promise;
    return existing.data;
  }

  const entry: CacheEntry = { data: null, error: null, fetchedAt: Date.now() };
  const promise = (async () => {
    try {
      const [issueResult, states] = await Promise.all([
        api.getIssue(issueKey, token),
        getStates(token),
      ]);
      const issue = issueResult.issue;
      const state = states.find((s) => s.id === issue.stateId);
      const assignee = issue.assigneeId ? usersById[issue.assigneeId] : null;
      const summary: IssueSummary = {
        key: issue.key,
        title: issue.title,
        stateId: issue.stateId,
        stateName: state?.name ?? 'Unknown',
        stateType: state?.type ?? 'unstarted',
        priority: issue.priority,
        assigneeId: issue.assigneeId,
        assigneeName: assignee?.displayName ?? assignee?.email ?? null,
        assigneeAvatar: assignee?.avatarUrl ?? null,
        assigneeIsAgent: assignee?.isAgent,
        assigneeHarness: assignee?.agentHarness,
      };
      entry.data = summary;
      entry.promise = undefined;
      return summary;
    } catch {
      entry.error = 'Not found';
      entry.promise = undefined;
      return null;
    }
  })();

  entry.promise = promise;
  cache.set(issueKey, entry);
  return promise;
}

/** Bust the states cache (e.g. when the user changes workflow states). */
export function clearIssueSummaryCache() {
  cache.clear();
  statesCache = null;
  statesFetchPromise = null;
}
