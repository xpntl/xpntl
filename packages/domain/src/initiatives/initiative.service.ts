import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, InitiativeRow } from '../types.js';

export type CreateInitiativeInput = {
  ctx: FullAuthContext;
  name: string;
  description?: string;
  color?: string;
};

export async function createInitiative(input: CreateInitiativeInput): Promise<InitiativeRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can create initiatives');
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ValidationError('name must be 1-200 characters');
  }

  return withTransaction(async (client) => {
    const id = newId();
    const result = await client.query<InitiativeRow>(
      `INSERT INTO initiatives (id, workspace_id, name, description, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.ctx.workspace.id, name, input.description?.trim() || null, input.color ?? '#4EA7FC'],
    );
    const initiative = result.rows[0];
    if (!initiative) throw new Error('Failed to create initiative');

    await recordOnClient(client, {
      workspaceId: input.ctx.workspace.id,
      actorUserId: input.ctx.user.id,
      eventType: 'initiative.created',
      targetType: 'initiative',
      targetId: initiative.id,
      metadata: { name: initiative.name },
    });

    return initiative;
  });
}

export async function listInitiatives(ctx: FullAuthContext): Promise<InitiativeRow[]> {
  const { rows } = await tenantPoolQuery<InitiativeRow>(
    ctx.workspace.id,
    `SELECT * FROM initiatives WHERE {TENANT} ORDER BY sort_order ASC, name ASC`,
  );
  return rows;
}

export async function getInitiativeById(ctx: FullAuthContext, id: string): Promise<InitiativeRow> {
  const { rows } = await tenantPoolQuery<InitiativeRow>(
    ctx.workspace.id,
    `SELECT * FROM initiatives WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Initiative not found');
  return rows[0];
}

export type UpdateInitiativeInput = {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  description?: string | null;
  status?: 'planned' | 'active' | 'completed' | 'canceled';
  color?: string;
};

export async function updateInitiative(input: UpdateInitiativeInput): Promise<InitiativeRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can update initiatives');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<InitiativeRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM initiatives WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Initiative not found');

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
    if (input.status !== undefined) {
      params.push(input.status);
      sets.push(`status = $${params.length}`);
    }
    if (input.color !== undefined) {
      params.push(input.color);
      sets.push(`color = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<InitiativeRow>(
      `UPDATE initiatives SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}
