import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, IssueTemplateRow } from '../types.js';

export type CreateIssueTemplateInput = {
  ctx: FullAuthContext;
  teamId?: string;
  name: string;
  description?: string;
  templateTitle?: string;
  templateBody?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  labelIds?: string[];
};

export async function createIssueTemplate(
  input: CreateIssueTemplateInput,
): Promise<IssueTemplateRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create issue templates');
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ValidationError('name must be 1-200 characters');
  }

  return withTransaction(async (client) => {
    const maxPos = await tenantClientQuery<{ max_pos: number | null }>(
      client,
      input.ctx.workspace.id,
      `SELECT MAX(position) as max_pos FROM issue_templates WHERE {TENANT}`,
    );

    const id = newId();
    const result = await client.query<IssueTemplateRow>(
      `INSERT INTO issue_templates
         (id, workspace_id, team_id, name, description, template_title, template_body,
          priority, state_id, assignee_id, label_ids, position, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        input.ctx.workspace.id,
        input.teamId ?? null,
        name,
        input.description?.trim() || null,
        input.templateTitle?.trim() || null,
        input.templateBody?.trim() || null,
        input.priority ?? 0,
        input.stateId ?? null,
        input.assigneeId ?? null,
        input.labelIds ?? [],
        (maxPos.rows[0]?.max_pos ?? -1) + 1,
        input.ctx.user.id,
      ],
    );
    return result.rows[0]!;
  });
}

export async function listIssueTemplates(
  ctx: FullAuthContext,
  teamId?: string,
): Promise<IssueTemplateRow[]> {
  if (teamId) {
    const { rows } = await tenantPoolQuery<IssueTemplateRow>(
      ctx.workspace.id,
      `SELECT * FROM issue_templates WHERE {TENANT} AND (team_id = $1 OR team_id IS NULL) ORDER BY position ASC`,
      [teamId],
    );
    return rows;
  }
  const { rows } = await tenantPoolQuery<IssueTemplateRow>(
    ctx.workspace.id,
    `SELECT * FROM issue_templates WHERE {TENANT} ORDER BY position ASC`,
  );
  return rows;
}

export async function getIssueTemplateById(
  ctx: FullAuthContext,
  id: string,
): Promise<IssueTemplateRow> {
  const { rows } = await tenantPoolQuery<IssueTemplateRow>(
    ctx.workspace.id,
    `SELECT * FROM issue_templates WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Issue template not found');
  return rows[0];
}

export type UpdateIssueTemplateInput = {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  description?: string | null;
  templateTitle?: string | null;
  templateBody?: string | null;
  priority?: number;
  stateId?: string | null;
  assigneeId?: string | null;
  labelIds?: string[];
};

export async function updateIssueTemplate(
  input: UpdateIssueTemplateInput,
): Promise<IssueTemplateRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can update issue templates');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<IssueTemplateRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM issue_templates WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Issue template not found');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      params.push(input.name.trim());
      sets.push(`name = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(input.description?.trim() || null);
      sets.push(`description = $${params.length}`);
    }
    if (input.templateTitle !== undefined) {
      params.push(input.templateTitle?.trim() || null);
      sets.push(`template_title = $${params.length}`);
    }
    if (input.templateBody !== undefined) {
      params.push(input.templateBody?.trim() || null);
      sets.push(`template_body = $${params.length}`);
    }
    if (input.priority !== undefined) {
      params.push(input.priority);
      sets.push(`priority = $${params.length}`);
    }
    if (input.stateId !== undefined) {
      params.push(input.stateId);
      sets.push(`state_id = $${params.length}`);
    }
    if (input.assigneeId !== undefined) {
      params.push(input.assigneeId);
      sets.push(`assignee_id = $${params.length}`);
    }
    if (input.labelIds !== undefined) {
      params.push(input.labelIds);
      sets.push(`label_ids = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<IssueTemplateRow>(
      `UPDATE issue_templates SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function deleteIssueTemplate(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can delete issue templates');
  }
  await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM issue_templates WHERE {TENANT} AND id = $1`,
    [id],
  );
}
