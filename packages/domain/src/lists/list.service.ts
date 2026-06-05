import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, ProjectListRow } from '../types.js';

/**
 * Lists (XP-74) — named grouping buckets within a project. A list is a grouping
 * axis only: the board can group issues by list, and an issue belongs to at
 * most one list within its project (issues.list_id).
 */

export async function listProjectLists(
  ctx: FullAuthContext,
  projectId: string,
): Promise<ProjectListRow[]> {
  const { rows } = await tenantPoolQuery<ProjectListRow>(
    ctx.workspace.id,
    `SELECT * FROM project_lists WHERE {TENANT} AND project_id = $1
      ORDER BY position ASC, lower(name) ASC`,
    [projectId],
  );
  return rows;
}

export async function createProjectList(input: {
  ctx: FullAuthContext;
  projectId: string;
  name: string;
  color?: string;
}): Promise<ProjectListRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create lists');
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new ValidationError('name must be 1-100 characters');
  }

  return withTransaction(async (client) => {
    // Project must belong to the workspace.
    const project = await tenantClientQuery<{ id: string }>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
      [input.projectId],
    );
    if (project.rows.length === 0) {
      throw new ValidationError('projectId not found in workspace');
    }

    const dupe = await tenantClientQuery<{ id: string }>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM project_lists WHERE {TENANT} AND project_id = $1 AND lower(name) = lower($2)`,
      [input.projectId, name],
    );
    if (dupe.rows.length > 0) {
      throw new ValidationError(`A list named "${name}" already exists in this project`);
    }

    const { rows: maxPos } = await client.query<{ max_pos: number | null }>(
      `SELECT MAX(position) AS max_pos FROM project_lists WHERE project_id = $1`,
      [input.projectId],
    );
    const nextPos = (maxPos[0]?.max_pos ?? -1) + 1;

    const result = await client.query<ProjectListRow>(
      `INSERT INTO project_lists (id, workspace_id, project_id, name, color, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [newId(), input.ctx.workspace.id, input.projectId, name, input.color ?? '#8B8B8B', nextPos],
    );
    return result.rows[0]!;
  });
}

export async function updateProjectList(input: {
  ctx: FullAuthContext;
  id: string;
  name?: string;
  color?: string;
}): Promise<ProjectListRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can update lists');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<ProjectListRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM project_lists WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('List not found');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 100) {
        throw new ValidationError('name must be 1-100 characters');
      }
      const dupe = await tenantClientQuery<{ id: string }>(
        client,
        input.ctx.workspace.id,
        `SELECT id FROM project_lists WHERE {TENANT} AND project_id = $1 AND lower(name) = lower($2) AND id <> $3`,
        [current.rows[0].project_id, name, input.id],
      );
      if (dupe.rows.length > 0) {
        throw new ValidationError(`A list named "${name}" already exists in this project`);
      }
      params.push(name);
      sets.push(`name = $${params.length}`);
    }
    if (input.color !== undefined) {
      params.push(input.color);
      sets.push(`color = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);
    const result = await client.query<ProjectListRow>(
      `UPDATE project_lists SET ${sets.join(', ')}
        WHERE workspace_id = $${params.length - 1} AND id = $${params.length}
        RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function deleteProjectList(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can delete lists');
  }
  // issues.list_id is ON DELETE SET NULL, so deleting a list just unfiles its
  // issues — it never destroys them.
  const result = await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM project_lists WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (result.rowCount === 0) throw new NotFoundError('List not found');
}

export async function reorderProjectLists(input: {
  ctx: FullAuthContext;
  projectId: string;
  orderedIds: string[];
}): Promise<ProjectListRow[]> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can reorder lists');
  }
  await withTransaction(async (client) => {
    for (let i = 0; i < input.orderedIds.length; i++) {
      await client.query(
        `UPDATE project_lists SET position = $1, updated_at = now()
          WHERE workspace_id = $2 AND project_id = $3 AND id = $4`,
        [i, input.ctx.workspace.id, input.projectId, input.orderedIds[i]],
      );
    }
  });
  return listProjectLists(input.ctx, input.projectId);
}
