/**
 * Issue list filtering. The shape mirrors the URL search params used in the web
 * client (see apps/web/src/lib/filter-dsl.ts), so what's typeable in the URL is
 * exactly what the server accepts.
 */

export type WorkflowStateType =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'review'
  | 'completed'
  | 'canceled';

export type IssueFilter = {
  /** Free-text query, matched via FTS against key + title + description. */
  q?: string;
  /** Filter to issues in any of these workflow state IDs. */
  stateIds?: string[];
  /** Filter to issues whose state is of any of these *types* (triage / backlog / unstarted / started / completed / canceled). */
  stateTypes?: WorkflowStateType[];
  /** Filter to issues with any of these priorities (0..4). */
  priorities?: number[];
  /** Filter to issues assigned to any of these user IDs. "me" is resolved by the caller. */
  assigneeIds?: string[];
  /** Filter to issues in a specific project. */
  projectId?: string;
  /** Title substring match (case-insensitive). */
  titleContains?: string;
  /** When true, only return root issues (parent_id IS NULL). Default true for list views. */
  rootOnly?: boolean;
  /** When true, return ONLY archived issues (the archived view). Default: archived issues are excluded. */
  archived?: boolean;
};

export type IssueSort =
  | 'manual'
  | 'created_desc'
  | 'created_asc'
  | 'updated_desc'
  | 'priority_asc'
  | 'key_asc';

const SORT_SQL: Record<IssueSort, string> = {
  manual: 'sort_order ASC, created_at DESC',
  created_desc: 'created_at DESC',
  created_asc: 'created_at ASC',
  updated_desc: 'updated_at DESC',
  priority_asc: 'CASE WHEN priority = 0 THEN 99 ELSE priority END ASC, created_at DESC',
  key_asc: 'key ASC',
};

export type CompiledFilter = {
  /** SQL fragment to append after `WHERE {TENANT}`, beginning with " AND " or empty. */
  whereSql: string;
  /** Parameters appended to the query, in order. */
  params: unknown[];
  /** SQL `ORDER BY` clause body (without the keyword). */
  orderBySql: string;
};

/**
 * Compile an IssueFilter into a SQL fragment + params suitable for use with
 * `tenantPoolQuery(workspaceId, 'SELECT * FROM issues WHERE {TENANT}' + whereSql + ' ORDER BY ' + orderBy, params)`.
 *
 * Always uses parameterized placeholders. Never interpolates user input into SQL.
 */
export function compileIssueFilter(
  filter: IssueFilter,
  sort: IssueSort = 'created_desc',
): CompiledFilter {
  const where: string[] = [];
  const params: unknown[] = [];

  const next = () => `$${params.length + 1}`;

  if (filter.stateIds && filter.stateIds.length > 0) {
    where.push(`state_id = ANY(${next()}::text[])`);
    params.push(filter.stateIds);
  }
  if (filter.stateTypes && filter.stateTypes.length > 0) {
    where.push(
      `state_id IN (SELECT id FROM workflow_states WHERE workspace_id = issues.workspace_id AND type = ANY(${next()}::text[]))`,
    );
    params.push(filter.stateTypes);
  }
  if (filter.priorities && filter.priorities.length > 0) {
    where.push(`priority = ANY(${next()}::int[])`);
    params.push(filter.priorities);
  }
  if (filter.assigneeIds && filter.assigneeIds.length > 0) {
    where.push(`assignee_id = ANY(${next()}::text[])`);
    params.push(filter.assigneeIds);
  }
  if (filter.projectId) {
    where.push(`project_id = ${next()}`);
    params.push(filter.projectId);
  }
  if (filter.titleContains && filter.titleContains.trim() !== '') {
    where.push(`title ILIKE ${next()}`);
    params.push(`%${filter.titleContains.trim()}%`);
  }
  if (filter.q && filter.q.trim() !== '') {
    where.push(`search_vector @@ websearch_to_tsquery('english', ${next()})`);
    params.push(filter.q.trim());
  }

  if (filter.rootOnly !== false) {
    where.push(`parent_id IS NULL`);
  }

  where.push(`deleted_at IS NULL`);

  // Archived issues are hidden from the board and the default list; the
  // archived view opts in explicitly.
  if (filter.archived) {
    where.push(`archived_at IS NOT NULL`);
  } else {
    where.push(`archived_at IS NULL`);
  }

  return {
    whereSql: where.length > 0 ? ` AND ${where.join(' AND ')}` : '',
    params,
    orderBySql: SORT_SQL[sort],
  };
}
