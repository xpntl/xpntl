import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { ForbiddenError, ValidationError } from '../errors.js';
import type { FullAuthContext, IssueAssigneeRow, UserRow } from '../types.js';

export async function setIssueAssignees(input: {
  ctx: FullAuthContext;
  issueId: string;
  userIds: string[];
}): Promise<IssueAssigneeRow[]> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can assign issues');
  }

  const uniqueIds = [...new Set(input.userIds)];

  if (uniqueIds.length > 0) {
    const { rows: existingUsers } = await tenantPoolQuery<UserRow>(
      input.ctx.workspace.id,
      'SELECT id FROM users WHERE {TENANT} AND id = ANY($1::text[])',
      [uniqueIds],
    );
    if (existingUsers.length !== uniqueIds.length) {
      throw new ValidationError('One or more user IDs not found in workspace');
    }
  }

  const pool = getPool();

  await pool.query('DELETE FROM issue_assignees WHERE issue_id = $1', [input.issueId]);

  // Keep the legacy single assignee_id in sync as the "primary" (first)
  // assignee, so grouping/filtering by assignee and single-avatar fallbacks
  // stay correct alongside the multi-assignee list (XP-72).
  await pool.query('UPDATE issues SET assignee_id = $1, updated_at = now() WHERE id = $2', [
    uniqueIds[0] ?? null,
    input.issueId,
  ]);

  if (uniqueIds.length === 0) return [];

  const values = uniqueIds.map(
    (uid, i) => `($1, $${i + 2}, ${i}, now(), $${uniqueIds.length + 2})`,
  );
  const params = [input.issueId, ...uniqueIds, input.ctx.user.id];

  const result = await pool.query<IssueAssigneeRow>(
    `INSERT INTO issue_assignees (issue_id, user_id, position, assigned_at, assigned_by)
     VALUES ${values.join(', ')}
     RETURNING *`,
    params,
  );
  return result.rows;
}

export async function addIssueAssignee(input: {
  ctx: FullAuthContext;
  issueId: string;
  userId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can assign issues');
  }

  const pool = getPool();

  const { rows: maxPos } = await pool.query<{ max_pos: number | null }>(
    'SELECT MAX(position) as max_pos FROM issue_assignees WHERE issue_id = $1',
    [input.issueId],
  );
  const nextPos = (maxPos[0]?.max_pos ?? -1) + 1;

  await pool.query(
    `INSERT INTO issue_assignees (issue_id, user_id, position, assigned_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (issue_id, user_id) DO NOTHING`,
    [input.issueId, input.userId, nextPos, input.ctx.user.id],
  );
}

export async function removeIssueAssignee(input: {
  ctx: FullAuthContext;
  issueId: string;
  userId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can unassign issues');
  }

  await getPool().query('DELETE FROM issue_assignees WHERE issue_id = $1 AND user_id = $2', [
    input.issueId,
    input.userId,
  ]);
}

export async function assigneesForIssues(
  ctx: FullAuthContext,
  issueIds: string[],
): Promise<Map<string, IssueAssigneeRow[]>> {
  if (issueIds.length === 0) return new Map();

  const { rows } = await getPool().query<IssueAssigneeRow>(
    `SELECT * FROM issue_assignees
     WHERE issue_id = ANY($1::text[])
     ORDER BY position ASC`,
    [issueIds],
  );

  const map = new Map<string, IssueAssigneeRow[]>();
  for (const r of rows) {
    const list = map.get(r.issue_id) ?? [];
    list.push(r);
    map.set(r.issue_id, list);
  }
  return map;
}
