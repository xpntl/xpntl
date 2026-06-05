import type { Issue, ProjectList, WorkflowState, WorkspaceUser } from './api';
import type { GroupKey } from './filter-url';
import { PRIORITY_LABELS } from './format';
import { nameForUser } from './user-store';

export type IssueGroup = { key: string; label: string; issues: Issue[] };

const NO_LIST_KEY = '__nolist';

export function groupIssues(
  issues: Issue[],
  group: GroupKey,
  stateById: Map<string, WorkflowState>,
  usersById?: Record<string, WorkspaceUser>,
  opts?: { includeEmpty?: boolean; listsById?: Record<string, ProjectList> },
): IssueGroup[] {
  if (group === 'none') {
    return [{ key: 'all', label: 'All issues', issues }];
  }

  const buckets = new Map<string, { label: string; sortKey: number; issues: Issue[] }>();

  if (opts?.includeEmpty) {
    if (group === 'state') {
      for (const [id, s] of stateById) {
        buckets.set(id, { label: s.name, sortKey: s.position, issues: [] });
      }
    } else if (group === 'priority') {
      for (let p = 1; p <= 4; p++) {
        buckets.set(String(p), { label: PRIORITY_LABELS[p] ?? 'Unknown', sortKey: p, issues: [] });
      }
      buckets.set('0', { label: PRIORITY_LABELS[0] ?? 'None', sortKey: 99, issues: [] });
    } else if (group === 'list' && opts.listsById) {
      for (const l of Object.values(opts.listsById)) {
        buckets.set(l.id, { label: l.name, sortKey: l.position, issues: [] });
      }
      // Always show a "No list" column so issues can be dragged out of a list.
      buckets.set(NO_LIST_KEY, { label: 'No list', sortKey: 9999, issues: [] });
    }
  }

  for (const issue of issues) {
    let bucketKey = '';
    let label = '';
    let sortKey = 0;

    if (group === 'state') {
      const state = stateById.get(issue.stateId);
      bucketKey = issue.stateId;
      label = state?.name ?? 'Unknown state';
      sortKey = state?.position ?? 999;
    } else if (group === 'priority') {
      bucketKey = String(issue.priority);
      label = PRIORITY_LABELS[issue.priority] ?? 'Unknown';
      sortKey = issue.priority === 0 ? 99 : issue.priority;
    } else if (group === 'assignee') {
      bucketKey = issue.assigneeId ?? '__unassigned';
      label = issue.assigneeId ? nameForUser(issue.assigneeId, usersById ?? {}) : 'Unassigned';
      sortKey = issue.assigneeId ? 0 : 999;
    } else if (group === 'list') {
      const list = issue.listId ? opts?.listsById?.[issue.listId] : undefined;
      bucketKey = issue.listId ?? NO_LIST_KEY;
      label = list?.name ?? 'No list';
      sortKey = list ? list.position : 9999;
    }

    const bucket = buckets.get(bucketKey) ?? { label, sortKey, issues: [] };
    bucket.issues.push(issue);
    buckets.set(bucketKey, bucket);
  }

  return [...buckets.entries()]
    .sort(([, a], [, b]) => a.sortKey - b.sortKey)
    .map(([key, b]) => ({
      key,
      label: b.label,
      issues: b.issues.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}
