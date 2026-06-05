import type { PoolClient, QueryResultRow } from 'pg';
import { getPool } from './pool.js';

const TENANT_PLACEHOLDER_RE = /(\b\w+\.)?\{TENANT\}/g;

/**
 * Rewrite every occurrence of `{TENANT}` in `sql` to `workspace_id = $N`,
 * where N is `nextParamIndex`. Preserves an optional table alias prefix
 * (e.g. `t.{TENANT}` becomes `t.workspace_id = $N`).
 *
 * Exported separately so unit tests can assert the rewrite without hitting the DB.
 */
export function rewriteTenantPlaceholder(sql: string, nextParamIndex: number): string {
  return sql.replace(TENANT_PLACEHOLDER_RE, (_match, prefix: string | undefined) => {
    return `${prefix ?? ''}workspace_id = $${nextParamIndex}`;
  });
}

/**
 * Run a workspace-scoped query.
 *
 * Rewrites every `{TENANT}` placeholder in `sql` to `workspace_id = $N`, where
 * N is the position of the appended `workspaceId` parameter. The workspaceId is
 * appended exactly once to the params array even if `{TENANT}` appears multiple
 * times in the query.
 *
 * Joins that pull in `users` must qualify the placeholder (`t.{TENANT}`) because
 * `users.workspace_id` collides with the base table's. This bit CentrixIQ in their
 * `territory.model.ts`; we encode the fix from day one.
 *
 * No other multi-tenant query helper exists. Bare `pool.query` is forbidden for
 * workspace-owned tables. If you find yourself wanting to bypass this, you are
 * about to introduce a tenancy bug.
 *
 * @example
 * const { rows } = await tenantPoolQuery<IssueRow>(
 *   workspaceId,
 *   `SELECT id, title FROM issues WHERE {TENANT} AND state = $1`,
 *   ['Backlog'],
 * );
 *
 * @example join with users
 * const { rows } = await tenantPoolQuery<IssueWithAssignee>(
 *   workspaceId,
 *   `SELECT i.id, i.title, u.email
 *      FROM issues i
 *      JOIN users u ON u.id = i.assignee_id
 *     WHERE i.{TENANT} AND u.{TENANT}`,
 *   [],
 * );
 */
export async function tenantPoolQuery<T extends QueryResultRow = QueryResultRow>(
  workspaceId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number | null }> {
  const tenantParamIndex = params.length + 1;
  const rewritten = rewriteTenantPlaceholder(sql, tenantParamIndex);
  const result = await getPool().query<T>(rewritten, [...params, workspaceId]);
  return { rows: result.rows, rowCount: result.rowCount };
}

/**
 * Same as `tenantPoolQuery` but uses a caller-provided client. Use this inside
 * `withTransaction` so the query joins the active transaction.
 */
export async function tenantClientQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  workspaceId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number | null }> {
  const tenantParamIndex = params.length + 1;
  const rewritten = rewriteTenantPlaceholder(sql, tenantParamIndex);
  const result = await client.query<T>(rewritten, [...params, workspaceId]);
  return { rows: result.rows, rowCount: result.rowCount };
}
