import { tenantPoolQuery } from '@xpntl/db';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type SavedViewRow = {
  id: string;
  workspace_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  scope: 'personal' | 'workspace';
  icon: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
};

export async function listSavedViews(ctx: FullAuthContext): Promise<SavedViewRow[]> {
  const { rows } = await tenantPoolQuery<SavedViewRow>(
    ctx.workspace.id,
    `SELECT * FROM saved_views
     WHERE {TENANT} AND (scope = 'workspace' OR creator_id = $1)
     ORDER BY scope ASC, position ASC, created_at DESC`,
    [ctx.user.id],
  );
  return rows;
}

export async function createSavedView(
  ctx: FullAuthContext,
  input: {
    name: string;
    description?: string | null;
    filters: Record<string, unknown>;
    scope?: 'personal' | 'workspace';
    icon?: string | null;
  },
): Promise<SavedViewRow> {
  const { rows: maxPos } = await tenantPoolQuery<{ max: number | null }>(
    ctx.workspace.id,
    `SELECT MAX(position) AS max FROM saved_views WHERE {TENANT} AND creator_id = $1`,
    [ctx.user.id],
  );
  const nextPos = (maxPos[0]?.max ?? -1) + 1;

  const id = newId();
  const { rows } = await tenantPoolQuery<SavedViewRow>(
    ctx.workspace.id,
    `INSERT INTO saved_views (id, workspace_id, creator_id, name, description, filters, scope, icon, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      ctx.workspace.id,
      ctx.user.id,
      input.name,
      input.description ?? null,
      JSON.stringify(input.filters),
      input.scope ?? 'personal',
      input.icon ?? null,
      nextPos,
    ],
  );
  return rows[0]!;
}

export async function updateSavedView(
  ctx: FullAuthContext,
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    filters?: Record<string, unknown>;
    scope?: 'personal' | 'workspace';
    icon?: string | null;
  },
): Promise<SavedViewRow> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let idx = 2;

  if (patch.name !== undefined) { sets.push(`name = $${idx++}`); params.push(patch.name); }
  if (patch.description !== undefined) { sets.push(`description = $${idx++}`); params.push(patch.description); }
  if (patch.filters !== undefined) { sets.push(`filters = $${idx++}`); params.push(JSON.stringify(patch.filters)); }
  if (patch.scope !== undefined) { sets.push(`scope = $${idx++}`); params.push(patch.scope); }
  if (patch.icon !== undefined) { sets.push(`icon = $${idx++}`); params.push(patch.icon); }

  sets.push('updated_at = now()');

  const { rows } = await tenantPoolQuery<SavedViewRow>(
    ctx.workspace.id,
    `UPDATE saved_views SET ${sets.join(', ')} WHERE {TENANT} AND id = $1 RETURNING *`,
    params,
  );
  return rows[0]!;
}

export async function deleteSavedView(ctx: FullAuthContext, id: string): Promise<void> {
  await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM saved_views WHERE {TENANT} AND id = $1`,
    [id],
  );
}
