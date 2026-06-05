import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, IssueTagRow, TagRow } from '../types.js';

export async function createTag(input: {
  ctx: FullAuthContext;
  name: string;
  color?: string;
}): Promise<TagRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create tags');
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) {
    throw new ValidationError('tag name must be 1-60 characters');
  }

  return withTransaction(async (client) => {
    const existing = await tenantClientQuery<TagRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM tags WHERE {TENANT} AND lower(name) = lower($1)`,
      [name],
    );
    if (existing.rows[0]) return existing.rows[0];

    const id = newId();
    const result = await client.query<TagRow>(
      `INSERT INTO tags (id, workspace_id, name, color, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.ctx.workspace.id, name, input.color ?? '#94A3B8', input.ctx.user.id],
    );
    return result.rows[0]!;
  });
}

export async function listTags(ctx: FullAuthContext): Promise<TagRow[]> {
  const { rows } = await tenantPoolQuery<TagRow>(
    ctx.workspace.id,
    `SELECT * FROM tags WHERE {TENANT} ORDER BY name ASC`,
  );
  return rows;
}

export async function deleteTag(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete tags');
  }
  await tenantPoolQuery(ctx.workspace.id, `DELETE FROM tags WHERE {TENANT} AND id = $1`, [id]);
}

export async function tagIssue(input: {
  ctx: FullAuthContext;
  issueId: string;
  tagId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can tag issues');
  }
  await getPool().query(
    `INSERT INTO issue_tags (issue_id, tag_id, tagged_by)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [input.issueId, input.tagId, input.ctx.user.id],
  );
}

export async function untagIssue(input: {
  ctx: FullAuthContext;
  issueId: string;
  tagId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can untag issues');
  }
  await getPool().query(`DELETE FROM issue_tags WHERE issue_id = $1 AND tag_id = $2`, [
    input.issueId,
    input.tagId,
  ]);
}

export async function tagsForIssues(
  ctx: FullAuthContext,
  issueIds: string[],
): Promise<Map<string, TagRow[]>> {
  if (issueIds.length === 0) return new Map();
  const { rows } = await getPool().query<TagRow & { issue_id: string }>(
    `SELECT t.*, it.issue_id
       FROM issue_tags it
       JOIN tags t ON t.id = it.tag_id
      WHERE it.issue_id = ANY($1::text[])
      ORDER BY t.name ASC`,
    [issueIds],
  );
  const map = new Map<string, TagRow[]>();
  for (const r of rows) {
    const list = map.get(r.issue_id) ?? [];
    list.push(r);
    map.set(r.issue_id, list);
  }
  return map;
}

export async function mergeTags(input: {
  ctx: FullAuthContext;
  sourceId: string;
  targetId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can merge tags');
  }
  const pool = getPool();
  // Delete source-tag rows where the issue already has the target tag (would violate PK).
  await pool.query(
    `DELETE FROM issue_tags s
     USING issue_tags t
     WHERE s.tag_id = $1 AND t.tag_id = $2 AND s.issue_id = t.issue_id`,
    [input.sourceId, input.targetId],
  );
  // Move remaining source-tag rows to the target tag.
  await pool.query(`UPDATE issue_tags SET tag_id = $1 WHERE tag_id = $2`, [
    input.targetId,
    input.sourceId,
  ]);
  await tenantPoolQuery(input.ctx.workspace.id, `DELETE FROM tags WHERE {TENANT} AND id = $1`, [
    input.sourceId,
  ]);
}
