import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, ProjectTemplateRow } from '../types.js';

export type CreateProjectTemplateInput = {
  ctx: FullAuthContext;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  variables?: ProjectTemplateRow['variables'];
  blueprint?: ProjectTemplateRow['blueprint'];
};

export async function createProjectTemplate(
  input: CreateProjectTemplateInput,
): Promise<ProjectTemplateRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can create project templates');
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ValidationError('name must be 1-200 characters');
  }

  return withTransaction(async (client) => {
    const id = newId();
    const result = await client.query<ProjectTemplateRow>(
      `INSERT INTO project_templates (id, workspace_id, name, description, icon, color, variables, blueprint, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        input.ctx.workspace.id,
        name,
        input.description?.trim() || null,
        input.icon?.trim() || null,
        input.color ?? '#4EA7FC',
        JSON.stringify(input.variables ?? []),
        JSON.stringify(input.blueprint ?? {}),
        input.ctx.user.id,
      ],
    );
    return result.rows[0]!;
  });
}

export async function listProjectTemplates(ctx: FullAuthContext): Promise<ProjectTemplateRow[]> {
  const { rows } = await tenantPoolQuery<ProjectTemplateRow>(
    ctx.workspace.id,
    `SELECT * FROM project_templates WHERE {TENANT} ORDER BY name ASC`,
  );
  return rows;
}

export async function getProjectTemplateById(
  ctx: FullAuthContext,
  id: string,
): Promise<ProjectTemplateRow> {
  const { rows } = await tenantPoolQuery<ProjectTemplateRow>(
    ctx.workspace.id,
    `SELECT * FROM project_templates WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Project template not found');
  return rows[0];
}

export type UpdateProjectTemplateInput = {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string;
  variables?: ProjectTemplateRow['variables'];
  blueprint?: ProjectTemplateRow['blueprint'];
};

export async function updateProjectTemplate(
  input: UpdateProjectTemplateInput,
): Promise<ProjectTemplateRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can update project templates');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<ProjectTemplateRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM project_templates WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Project template not found');

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
    if (input.icon !== undefined) {
      params.push(input.icon?.trim() || null);
      sets.push(`icon = $${params.length}`);
    }
    if (input.color !== undefined) {
      params.push(input.color);
      sets.push(`color = $${params.length}`);
    }
    if (input.variables !== undefined) {
      params.push(JSON.stringify(input.variables));
      sets.push(`variables = $${params.length}`);
    }
    if (input.blueprint !== undefined) {
      params.push(JSON.stringify(input.blueprint));
      sets.push(`blueprint = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<ProjectTemplateRow>(
      `UPDATE project_templates SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function deleteProjectTemplate(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete project templates');
  }
  await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM project_templates WHERE {TENANT} AND id = $1`,
    [id],
  );
}
