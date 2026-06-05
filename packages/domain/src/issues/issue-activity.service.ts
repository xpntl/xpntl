import { type PoolClient, tenantPoolQuery } from '@xpntl/db';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type IssueActivityAction =
  | 'state_change'
  | 'assignment_change'
  | 'priority_change'
  | 'label_change'
  | 'description_edit'
  | 'title_edit'
  | 'comment_added'
  | 'comment_resolved'
  | 'relation_added'
  | 'relation_removed';

export type IssueActivityRow = {
  id: string;
  issue_id: string;
  workspace_id: string;
  actor_id: string | null;
  action: IssueActivityAction;
  old_value: unknown;
  new_value: unknown;
  created_at: Date;
  // Joined fields
  actor_display_name: string | null;
  actor_email: string | null;
  actor_avatar_url: string | null;
};

/**
 * Log an activity entry inside an existing transaction.
 */
export async function logActivityOnClient(
  client: PoolClient,
  opts: {
    issueId: string;
    workspaceId: string;
    actorId: string | null;
    action: IssueActivityAction;
    oldValue?: unknown;
    newValue?: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO issue_activity (id, issue_id, workspace_id, actor_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      newId(),
      opts.issueId,
      opts.workspaceId,
      opts.actorId,
      opts.action,
      opts.oldValue != null ? JSON.stringify(opts.oldValue) : null,
      opts.newValue != null ? JSON.stringify(opts.newValue) : null,
    ],
  );
}

/**
 * Log an activity entry using the pool (outside a transaction).
 */
export async function logActivity(
  ctx: FullAuthContext,
  issueId: string,
  action: IssueActivityAction,
  oldValue?: unknown,
  newValue?: unknown,
): Promise<void> {
  await tenantPoolQuery(
    ctx.workspace.id,
    `INSERT INTO issue_activity (id, issue_id, workspace_id, actor_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      newId(),
      issueId,
      ctx.workspace.id,
      ctx.user.id,
      action,
      oldValue != null ? JSON.stringify(oldValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
    ],
  );
}

/**
 * List activity entries for an issue, newest first, with cursor-based pagination.
 */
export async function listIssueActivity(
  ctx: FullAuthContext,
  issueId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<IssueActivityRow[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const params: unknown[] = [issueId, limit];
  let cursorClause = '';

  if (opts?.cursor) {
    cursorClause = ` AND ia.created_at < $3`;
    params.push(new Date(opts.cursor));
  }

  const { rows } = await tenantPoolQuery<IssueActivityRow>(
    ctx.workspace.id,
    `SELECT ia.id, ia.issue_id, ia.workspace_id, ia.actor_id, ia.action,
            ia.old_value, ia.new_value, ia.created_at,
            u.display_name AS actor_display_name,
            u.email AS actor_email,
            u.avatar_url AS actor_avatar_url
       FROM issue_activity ia
       LEFT JOIN users u ON u.id = ia.actor_id
      WHERE ia.{TENANT} AND ia.issue_id = $1${cursorClause}
      ORDER BY ia.created_at DESC
      LIMIT $2`,
    params,
  );
  return rows;
}
