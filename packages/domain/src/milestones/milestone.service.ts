import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, MilestoneRow, ProjectRow } from '../types.js';

export type CreateMilestoneInput = {
  ctx: FullAuthContext;
  projectId: string;
  name: string;
  description?: string;
  targetDate?: string;
};

export async function createMilestone(input: CreateMilestoneInput): Promise<MilestoneRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create milestones');
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ValidationError('name must be 1-200 characters');
  }

  return withTransaction(async (client) => {
    const projectExists = await tenantClientQuery<ProjectRow>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
      [input.projectId],
    );
    if (projectExists.rows.length === 0) {
      throw new ValidationError('Project not found');
    }

    const id = newId();
    const result = await client.query<MilestoneRow>(
      `INSERT INTO milestones (id, workspace_id, project_id, name, description, target_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        input.ctx.workspace.id,
        input.projectId,
        name,
        input.description?.trim() || null,
        input.targetDate ? new Date(input.targetDate) : null,
      ],
    );
    const milestone = result.rows[0];
    if (!milestone) throw new Error('Failed to create milestone');

    await recordOnClient(client, {
      workspaceId: input.ctx.workspace.id,
      actorUserId: input.ctx.user.id,
      eventType: 'milestone.created',
      targetType: 'milestone',
      targetId: milestone.id,
      metadata: { name: milestone.name, projectId: input.projectId },
    });

    return milestone;
  });
}

export async function listMilestones(ctx: FullAuthContext, projectId: string): Promise<MilestoneRow[]> {
  const { rows } = await tenantPoolQuery<MilestoneRow>(
    ctx.workspace.id,
    `SELECT * FROM milestones WHERE {TENANT} AND project_id = $1 ORDER BY sort_order ASC, target_date ASC NULLS LAST`,
    [projectId],
  );
  return rows;
}

export async function getMilestoneById(ctx: FullAuthContext, id: string): Promise<MilestoneRow> {
  const { rows } = await tenantPoolQuery<MilestoneRow>(
    ctx.workspace.id,
    `SELECT * FROM milestones WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Milestone not found');
  return rows[0];
}

export type UpdateMilestoneInput = {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  description?: string | null;
  targetDate?: string | null;
};

export async function updateMilestone(input: UpdateMilestoneInput): Promise<MilestoneRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can update milestones');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<MilestoneRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM milestones WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Milestone not found');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 200)
        throw new ValidationError('name must be 1-200 characters');
      params.push(name);
      sets.push(`name = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(input.description?.trim() || null);
      sets.push(`description = $${params.length}`);
    }
    if (input.targetDate !== undefined) {
      params.push(input.targetDate ? new Date(input.targetDate) : null);
      sets.push(`target_date = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<MilestoneRow>(
      `UPDATE milestones SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function deleteMilestone(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete milestones');
  }
  const result = await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM milestones WHERE {TENANT} AND id = $1`,
    [id],
  );
}
