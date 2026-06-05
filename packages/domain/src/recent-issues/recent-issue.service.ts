import { tenantPoolQuery } from '@xpntl/db';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type RecentIssueRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  issue_key: string;
  issue_title: string;
  viewed_at: Date;
};

export async function listRecentIssues(
  ctx: FullAuthContext,
  limit: number = 8,
): Promise<RecentIssueRow[]> {
  const { rows } = await tenantPoolQuery<RecentIssueRow>(
    ctx.workspace.id,
    `SELECT r.* FROM recent_issues r
     INNER JOIN issues i ON i.key = r.issue_key AND i.workspace_id = r.workspace_id
     WHERE r.{TENANT} AND r.user_id = $1 AND i.deleted_at IS NULL
     ORDER BY r.viewed_at DESC LIMIT $2`,
    [ctx.user.id, limit],
  );
  return rows;
}

export async function pushRecentIssue(
  ctx: FullAuthContext,
  issueKey: string,
  issueTitle: string,
): Promise<RecentIssueRow> {
  const id = newId();
  // $5 = workspaceId auto-appended by tenantPoolQuery
  const { rows } = await tenantPoolQuery<RecentIssueRow>(
    ctx.workspace.id,
    `INSERT INTO recent_issues (id, workspace_id, user_id, issue_key, issue_title, viewed_at)
     VALUES ($1, $5, $2, $3, $4, NOW())
     ON CONFLICT (workspace_id, user_id, issue_key)
     DO UPDATE SET viewed_at = NOW(), issue_title = EXCLUDED.issue_title
     RETURNING *`,
    [id, ctx.user.id, issueKey, issueTitle],
  );

  // Trim old entries beyond 20 per user.
  await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM recent_issues
     WHERE {TENANT} AND user_id = $1
       AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM recent_issues
           WHERE {TENANT} AND user_id = $1
           ORDER BY viewed_at DESC LIMIT 20
         ) AS keep
       )`,
    [ctx.user.id],
  );

  return rows[0]!;
}
