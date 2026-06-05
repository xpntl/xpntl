import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type RelationType =
  | 'blocks'
  | 'blocked_by'
  | 'relates_to'
  | 'duplicate_of'
  | 'duplicated_by';

const VALID_TYPES: RelationType[] = [
  'blocks',
  'blocked_by',
  'relates_to',
  'duplicate_of',
  'duplicated_by',
];

const INVERSE: Record<RelationType, RelationType> = {
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  relates_to: 'relates_to',
  duplicate_of: 'duplicated_by',
  duplicated_by: 'duplicate_of',
};

export type IssueRelationRow = {
  id: string;
  workspace_id: string;
  from_issue_id: string;
  to_issue_id: string;
  type: RelationType;
  created_by: string | null;
  created_at: Date;
};

export type IssueRelationWithKey = IssueRelationRow & {
  related_issue_key: string;
  related_issue_title: string;
};

export async function createRelation(input: {
  ctx: FullAuthContext;
  fromIssueId: string;
  toIssueId: string;
  type: RelationType;
}): Promise<IssueRelationRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create relations');
  }

  if (!VALID_TYPES.includes(input.type)) {
    throw new ValidationError(`Invalid relation type: ${input.type}`);
  }

  if (input.fromIssueId === input.toIssueId) {
    throw new ValidationError('Cannot relate an issue to itself');
  }

  const pool = getPool();

  const { rows } = await pool.query<IssueRelationRow>(
    `INSERT INTO issue_relations (id, workspace_id, from_issue_id, to_issue_id, type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (from_issue_id, to_issue_id, type) DO NOTHING
     RETURNING *`,
    [newId(), input.ctx.workspace.id, input.fromIssueId, input.toIssueId, input.type, input.ctx.user.id],
  );

  if (!rows[0]) {
    const existing = await pool.query<IssueRelationRow>(
      `SELECT * FROM issue_relations WHERE from_issue_id = $1 AND to_issue_id = $2 AND type = $3`,
      [input.fromIssueId, input.toIssueId, input.type],
    );
    return existing.rows[0]!;
  }

  // Create inverse relation
  const inverseType = INVERSE[input.type];
  await pool.query(
    `INSERT INTO issue_relations (id, workspace_id, from_issue_id, to_issue_id, type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (from_issue_id, to_issue_id, type) DO NOTHING`,
    [newId(), input.ctx.workspace.id, input.toIssueId, input.fromIssueId, inverseType, input.ctx.user.id],
  );

  return rows[0];
}

export async function deleteRelation(input: {
  ctx: FullAuthContext;
  fromIssueId: string;
  toIssueId: string;
  type: RelationType;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can remove relations');
  }

  const pool = getPool();
  const inverseType = INVERSE[input.type];

  await pool.query(
    `DELETE FROM issue_relations WHERE from_issue_id = $1 AND to_issue_id = $2 AND type = $3`,
    [input.fromIssueId, input.toIssueId, input.type],
  );
  await pool.query(
    `DELETE FROM issue_relations WHERE from_issue_id = $1 AND to_issue_id = $2 AND type = $3`,
    [input.toIssueId, input.fromIssueId, inverseType],
  );
}

export async function listRelationsForIssue(
  ctx: FullAuthContext,
  issueId: string,
): Promise<IssueRelationWithKey[]> {
  const { rows } = await tenantPoolQuery<
    IssueRelationRow & { related_issue_key: string; related_issue_title: string }
  >(
    ctx.workspace.id,
    `SELECT r.*, i.key AS related_issue_key, i.title AS related_issue_title
       FROM issue_relations r
       JOIN issues i ON i.id = r.to_issue_id
      WHERE r.{TENANT} AND r.from_issue_id = $1
      ORDER BY r.created_at ASC`,
    [issueId],
  );
  return rows;
}

export async function relationsForIssues(
  ctx: FullAuthContext,
  issueIds: string[],
): Promise<Map<string, IssueRelationWithKey[]>> {
  if (issueIds.length === 0) return new Map();
  const { rows } = await tenantPoolQuery<
    IssueRelationRow & { related_issue_key: string; related_issue_title: string }
  >(
    ctx.workspace.id,
    `SELECT r.*, i.key AS related_issue_key, i.title AS related_issue_title
       FROM issue_relations r
       JOIN issues i ON i.id = r.to_issue_id
      WHERE r.{TENANT} AND r.from_issue_id = ANY($1::text[])
      ORDER BY r.created_at ASC`,
    [issueIds],
  );
  const map = new Map<string, IssueRelationWithKey[]>();
  for (const r of rows) {
    const list = map.get(r.from_issue_id) ?? [];
    list.push(r);
    map.set(r.from_issue_id, list);
  }
  return map;
}
