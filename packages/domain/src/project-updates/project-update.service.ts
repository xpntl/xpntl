// XP-21 Project updates — timed status posts with a health signal.

import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { canCreateIssue } from '../authz.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export const PROJECT_UPDATE_HEALTHS = ['on_track', 'at_risk', 'off_track'] as const;
export type ProjectUpdateHealth = (typeof PROJECT_UPDATE_HEALTHS)[number];

export function isValidHealth(value: string): value is ProjectUpdateHealth {
  return (PROJECT_UPDATE_HEALTHS as readonly string[]).includes(value);
}

export type ProjectUpdateRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  body: string;
  health: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function listProjectUpdates(
  ctx: FullAuthContext,
  projectId: string,
): Promise<ProjectUpdateRow[]> {
  const { rows } = await tenantPoolQuery<ProjectUpdateRow>(
    ctx.workspace.id,
    `SELECT * FROM project_updates WHERE {TENANT} AND project_id = $1 ORDER BY created_at DESC`,
    [projectId],
  );
  return rows;
}

export async function createProjectUpdate(
  ctx: FullAuthContext,
  input: { projectId: string; body: string; health?: string },
): Promise<ProjectUpdateRow> {
  if (!canCreateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to post project updates');
  }
  const body = input.body.trim();
  if (body.length < 1 || body.length > 10_000) {
    throw new ValidationError('Update body must be 1-10,000 characters');
  }
  const health = input.health ?? 'on_track';
  if (!isValidHealth(health)) {
    throw new ValidationError('invalid health value');
  }

  // Confirm the project belongs to this workspace (tenant-scoped).
  const projectCheck = await tenantPoolQuery<{ id: string }>(
    ctx.workspace.id,
    `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
    [input.projectId],
  );
  if (projectCheck.rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // INSERT uses the pool with an explicit workspace_id value — {TENANT} is only
  // valid as a WHERE predicate, never inside VALUES (cf. XP-69).
  const { rows } = await getPool().query<ProjectUpdateRow>(
    `INSERT INTO project_updates (id, workspace_id, project_id, body, health, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [newId(), ctx.workspace.id, input.projectId, body, health, ctx.user.id],
  );
  const update = rows[0];
  if (!update) throw new Error('Failed to create project update');
  return update;
}

export async function deleteProjectUpdate(ctx: FullAuthContext, id: string): Promise<void> {
  // Load first (tenant-scoped) so we can enforce ownership — only the author or
  // a workspace admin may delete an update. Tenant scope alone is not enough
  // (any member could otherwise delete a peer's update by id).
  const { rows } = await tenantPoolQuery<{ created_by: string | null }>(
    ctx.workspace.id,
    `SELECT created_by FROM project_updates WHERE {TENANT} AND id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Project update not found');

  const isOwner = row.created_by === ctx.user.id;
  if (!isOwner && !isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('You can only delete your own project updates');
  }

  await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM project_updates WHERE {TENANT} AND id = $1`,
    [id],
  );
}
