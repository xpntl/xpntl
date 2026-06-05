import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { enforceSubscriptionLimits } from '../billing/gate.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { writeOp } from '../sync/op-log.service.js';
import type { FullAuthContext, ProjectRow, UserRow } from '../types.js';

export type CreateProjectInput = {
  ctx: FullAuthContext;
  name: string;
  key: string;
  description?: string;
  color?: string;
  icon?: string;
  leadId?: string;
  initiativeId?: string;
  startDate?: string;
  targetDate?: string;
};

export async function createProject(input: CreateProjectInput): Promise<ProjectRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create projects');
  }
  await enforceSubscriptionLimits(input.ctx, 'projects');

  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ValidationError('name must be 1-200 characters');
  }

  const projectKey = input.key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (projectKey.length < 1 || projectKey.length > 10) {
    throw new ValidationError('key must be 1-10 uppercase alphanumeric characters');
  }

  return withTransaction(async (client) => {
    // Check key uniqueness within workspace.
    const keyExists = await tenantClientQuery<ProjectRow>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM projects WHERE {TENANT} AND key = $1`,
      [projectKey],
    );
    if (keyExists.rows.length > 0) {
      throw new ValidationError(`Project key "${projectKey}" is already in use`);
    }

    // Name is unique per workspace (case-insensitive) — check explicitly so a
    // duplicate returns a clean 400 instead of an unhandled 23505 → 500.
    const nameExists = await tenantClientQuery<ProjectRow>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM projects WHERE {TENANT} AND lower(name) = lower($1)`,
      [name],
    );
    if (nameExists.rows.length > 0) {
      throw new ValidationError(`A project named "${name}" already exists`);
    }

    if (input.leadId) {
      const userExists = await tenantClientQuery<UserRow>(
        client,
        input.ctx.workspace.id,
        `SELECT id FROM users WHERE {TENANT} AND id = $1`,
        [input.leadId],
      );
      if (userExists.rows.length === 0) {
        throw new ValidationError('leadId not found in workspace');
      }
    }

    const id = newId();
    const result = await client.query<ProjectRow>(
      `INSERT INTO projects (id, workspace_id, name, key, description, color, icon, lead_id, initiative_id, start_date, target_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        input.ctx.workspace.id,
        name,
        projectKey,
        input.description?.trim() || null,
        input.color ?? '#4EA7FC',
        input.icon?.trim() || null,
        input.leadId ?? null,
        input.initiativeId ?? null,
        input.startDate ? new Date(input.startDate) : null,
        input.targetDate ? new Date(input.targetDate) : null,
      ],
    );
    const project = result.rows[0];
    if (!project) throw new Error('Failed to create project');

    await recordOnClient(client, {
      workspaceId: input.ctx.workspace.id,
      actorUserId: input.ctx.user.id,
      eventType: 'project.created',
      targetType: 'project',
      targetId: project.id,
      metadata: { name: project.name },
    });

    return project;
  });
}

export async function listProjects(ctx: FullAuthContext): Promise<ProjectRow[]> {
  const { rows } = await tenantPoolQuery<ProjectRow>(
    ctx.workspace.id,
    `SELECT * FROM projects WHERE {TENANT} ORDER BY sort_order ASC, name ASC`,
  );
  return rows;
}

export async function getProjectById(ctx: FullAuthContext, id: string): Promise<ProjectRow> {
  const { rows } = await tenantPoolQuery<ProjectRow>(
    ctx.workspace.id,
    `SELECT * FROM projects WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Project not found');
  return rows[0];
}

export type UpdateProjectInput = {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  key?: string;
  description?: string | null;
  status?: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  color?: string;
  icon?: string | null;
  leadId?: string | null;
  initiativeId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
};

export async function updateProject(input: UpdateProjectInput): Promise<ProjectRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can update projects');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<ProjectRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM projects WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Project not found');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 200)
        throw new ValidationError('name must be 1-200 characters');
      params.push(name);
      sets.push(`name = $${params.length}`);
    }
    if (input.key !== undefined) {
      const projectKey = input.key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (projectKey.length < 1 || projectKey.length > 10)
        throw new ValidationError('key must be 1-10 uppercase alphanumeric characters');
      // Check uniqueness (excluding self).
      const keyExists = await tenantClientQuery<ProjectRow>(
        client,
        input.ctx.workspace.id,
        `SELECT id FROM projects WHERE {TENANT} AND key = $1 AND id <> $2`,
        [projectKey, input.id],
      );
      if (keyExists.rows.length > 0) {
        throw new ValidationError(`Project key "${projectKey}" is already in use`);
      }
      params.push(projectKey);
      sets.push(`key = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(input.description?.trim() || null);
      sets.push(`description = $${params.length}`);
    }
    if (input.status !== undefined) {
      params.push(input.status);
      sets.push(`status = $${params.length}`);
    }
    if (input.color !== undefined) {
      params.push(input.color);
      sets.push(`color = $${params.length}`);
    }
    if (input.icon !== undefined) {
      params.push(input.icon?.trim() || null);
      sets.push(`icon = $${params.length}`);
    }
    if (input.leadId !== undefined) {
      params.push(input.leadId);
      sets.push(`lead_id = $${params.length}`);
    }
    if (input.initiativeId !== undefined) {
      params.push(input.initiativeId);
      sets.push(`initiative_id = $${params.length}`);
    }
    if (input.startDate !== undefined) {
      params.push(input.startDate ? new Date(input.startDate) : null);
      sets.push(`start_date = $${params.length}`);
    }
    if (input.targetDate !== undefined) {
      params.push(input.targetDate ? new Date(input.targetDate) : null);
      sets.push(`target_date = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<ProjectRow>(
      `UPDATE projects SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );

    // Real-time fan-out (XP-3) — keeps sidebar/project lists live across clients.
    await writeOp(client, {
      workspaceId: input.ctx.workspace.id,
      actorId: input.ctx.user.id,
      entityType: 'project',
      entityId: input.id,
      mutation: 'update',
    });

    return result.rows[0]!;
  });
}

export async function deleteProject(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete projects');
  }
  try {
    const result = await tenantPoolQuery(
      ctx.workspace.id,
      `DELETE FROM projects WHERE {TENANT} AND id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Project not found');
    }
  } catch (err: unknown) {
    if (err instanceof NotFoundError) throw err;
    const code = (err as { code?: string }).code;
    if (code === '23503') {
      throw new ConflictError('Cannot delete a project that still has issues. Move or delete them first.');
    }
    throw err;
  }
}

export async function addProjectTeam(input: {
  ctx: FullAuthContext;
  projectId: string;
  teamId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can link teams to projects');
  }
  await getPool().query(
    `INSERT INTO project_teams (project_id, team_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [input.projectId, input.teamId],
  );
}

export async function removeProjectTeam(input: {
  ctx: FullAuthContext;
  projectId: string;
  teamId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can unlink teams from projects');
  }
  await getPool().query(`DELETE FROM project_teams WHERE project_id = $1 AND team_id = $2`, [
    input.projectId,
    input.teamId,
  ]);
}
