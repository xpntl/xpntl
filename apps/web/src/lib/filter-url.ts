import type { IssueFilterQuery } from './api';

/**
 * URL-as-state: read filter state from URLSearchParams and write it back.
 * The same query keys hit the API directly, so the URL is the contract.
 */

export type StateType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'review' | 'completed' | 'canceled';

export type ParsedFilter = {
  q: string;
  stateIds: string[];
  stateTypes: StateType[];
  priorities: number[];
  assigneeIds: string[];
  project: string;
  sort: SortKey;
  group: GroupKey;
  view: ViewKey;
};

export const SORT_OPTIONS = [
  'manual',
  'created_desc',
  'created_asc',
  'updated_desc',
  'priority_asc',
  'key_asc',
] as const;
export const GROUP_OPTIONS = ['none', 'state', 'priority', 'assignee', 'list'] as const;
export const VIEW_OPTIONS = ['list', 'board', 'roadmap'] as const;

export type SortKey = (typeof SORT_OPTIONS)[number];
export type GroupKey = (typeof GROUP_OPTIONS)[number];
export type ViewKey = (typeof VIEW_OPTIONS)[number];

export function parseFromSearchParams(sp: URLSearchParams): ParsedFilter {
  const q = sp.get('q') ?? '';
  const stateIds = csv(sp.get('state'));
  const priorities = csv(sp.get('priority'))
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 4);
  const stateTypes = csv(sp.get('stateType')).filter(
    (t): t is StateType =>
      ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'].includes(t),
  );
  const assigneeIds = csv(sp.get('assignee'));
  const project = sp.get('project') ?? sp.get('projectId') ?? '';
  const sort = (SORT_OPTIONS as readonly string[]).includes(sp.get('sort') ?? '')
    ? (sp.get('sort') as SortKey)
    : 'manual';
  const group = (GROUP_OPTIONS as readonly string[]).includes(sp.get('group') ?? '')
    ? (sp.get('group') as GroupKey)
    : 'none';
  const view = (VIEW_OPTIONS as readonly string[]).includes(sp.get('view') ?? '')
    ? (sp.get('view') as ViewKey)
    : 'board';
  return { q, stateIds, stateTypes, priorities, assigneeIds, project, sort, group, view };
}

export function toApiQuery(filter: ParsedFilter, resolvedProjectId?: string): IssueFilterQuery {
  const out: IssueFilterQuery = {};
  if (filter.q) out.q = filter.q;
  if (filter.stateIds.length > 0) out.state = filter.stateIds.join(',');
  if (filter.stateTypes.length > 0) out.stateType = filter.stateTypes.join(',');
  if (filter.priorities.length > 0) out.priority = filter.priorities.join(',');
  if (filter.assigneeIds.length > 0) out.assignee = filter.assigneeIds.join(',');
  if (resolvedProjectId) out.projectId = resolvedProjectId;
  if (filter.sort !== 'manual') out.sort = filter.sort;
  return out;
}

export function toSearchParams(filter: ParsedFilter): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.q) sp.set('q', filter.q);
  if (filter.stateIds.length > 0) sp.set('state', filter.stateIds.join(','));
  if (filter.stateTypes.length > 0) sp.set('stateType', filter.stateTypes.join(','));
  if (filter.priorities.length > 0) sp.set('priority', filter.priorities.join(','));
  if (filter.assigneeIds.length > 0) sp.set('assignee', filter.assigneeIds.join(','));
  if (filter.project) sp.set('project', filter.project);
  if (filter.sort !== 'manual') sp.set('sort', filter.sort);
  if (filter.group !== 'none') sp.set('group', filter.group);
  if (filter.view !== 'board') sp.set('view', filter.view);
  return sp;
}

function csv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
