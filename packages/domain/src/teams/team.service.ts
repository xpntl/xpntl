import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, TeamMemberRow, TeamRow, UserRow } from '../types.js';

export type CreateTeamInput = {
  ctx: FullAuthContext;
  name: string;
  key: string;
  description?: string;
  icon?: string;
};

export async function createTeam(input: CreateTeamInput): Promise<TeamRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can create teams');
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new ValidationError('name must be 1-100 characters');
  }

  const key = input.key.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,5}$/.test(key)) {
    throw new ValidationError(
      'key must be 1-6 uppercase alphanumeric characters starting with a letter',
    );
  }

  return withTransaction(async (client) => {
    const existing = await tenantClientQuery<TeamRow>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM teams WHERE {TENANT} AND upper(key) = $1`,
      [key],
    );
    if (existing.rows.length > 0) {
      throw new ValidationError(`Team key "${key}" already exists`);
    }

    const id = newId();
    const result = await client.query<TeamRow>(
      `INSERT INTO teams (id, workspace_id, name, key, description, icon)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        input.ctx.workspace.id,
        name,
        key,
        input.description?.trim() || null,
        input.icon?.trim() || null,
      ],
    );
    const team = result.rows[0];
    if (!team) throw new Error('Failed to create team');

    await client.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'Lead')`,
      [team.id, input.ctx.user.id],
    );

    await recordOnClient(client, {
      workspaceId: input.ctx.workspace.id,
      actorUserId: input.ctx.user.id,
      eventType: 'team.created',
      targetType: 'team',
      targetId: team.id,
      metadata: { name: team.name, key: team.key },
    });

    return team;
  });
}

export async function listTeams(ctx: FullAuthContext): Promise<TeamRow[]> {
  const { rows } = await tenantPoolQuery<TeamRow>(
    ctx.workspace.id,
    `SELECT * FROM teams WHERE {TENANT} ORDER BY name ASC`,
  );
  return rows;
}

export async function getTeamById(ctx: FullAuthContext, id: string): Promise<TeamRow> {
  const { rows } = await tenantPoolQuery<TeamRow>(
    ctx.workspace.id,
    `SELECT * FROM teams WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError(`Team not found`);
  return rows[0];
}

export type UpdateTeamInput = {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
};

export async function updateTeam(input: UpdateTeamInput): Promise<TeamRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can update teams');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<TeamRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM teams WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Team not found');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 100) {
        throw new ValidationError('name must be 1-100 characters');
      }
      params.push(name);
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

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<TeamRow>(
      `UPDATE teams SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function listTeamMembers(
  ctx: FullAuthContext,
  teamId: string,
): Promise<(TeamMemberRow & { email: string; display_name: string | null })[]> {
  const { rows } = await tenantPoolQuery<
    TeamMemberRow & { email: string; display_name: string | null }
  >(
    ctx.workspace.id,
    `SELECT tm.*, u.email, u.display_name
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
      WHERE u.{TENANT}
        AND tm.team_id = $1
      ORDER BY tm.joined_at ASC`,
    [teamId],
  );
  return rows;
}

export async function addTeamMember(input: {
  ctx: FullAuthContext;
  teamId: string;
  userId: string;
  role?: 'Lead' | 'Member';
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can manage team members');
  }

  const userExists = await tenantPoolQuery<UserRow>(
    input.ctx.workspace.id,
    `SELECT id FROM users WHERE {TENANT} AND id = $1`,
    [input.userId],
  );
  if (userExists.rows.length === 0) {
    throw new ValidationError('User not found in workspace');
  }

  await getPool().query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [input.teamId, input.userId, input.role ?? 'Member'],
  );
}

export async function removeTeamMember(input: {
  ctx: FullAuthContext;
  teamId: string;
  userId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can manage team members');
  }

  await getPool().query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [
    input.teamId,
    input.userId,
  ]);
}
