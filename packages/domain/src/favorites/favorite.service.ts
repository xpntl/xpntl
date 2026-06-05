import { tenantPoolQuery } from '@xpntl/db';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type FavoriteRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  entity_type: 'issue' | 'project' | 'view';
  entity_id: string;
  position: number;
  created_at: Date;
};

export async function listFavorites(
  ctx: FullAuthContext,
  entityType?: FavoriteRow['entity_type'],
): Promise<FavoriteRow[]> {
  const baseSQL = `SELECT * FROM favorites WHERE {TENANT} AND user_id = $1`;
  if (entityType) {
    const { rows } = await tenantPoolQuery<FavoriteRow>(
      ctx.workspace.id,
      `${baseSQL} AND entity_type = $2 ORDER BY position ASC, created_at DESC`,
      [ctx.user.id, entityType],
    );
    return rows;
  }
  const { rows } = await tenantPoolQuery<FavoriteRow>(
    ctx.workspace.id,
    `${baseSQL} ORDER BY entity_type ASC, position ASC, created_at DESC`,
    [ctx.user.id],
  );
  return rows;
}

export async function toggleFavorite(
  ctx: FullAuthContext,
  entityType: FavoriteRow['entity_type'],
  entityId: string,
): Promise<{ favorited: boolean }> {
  const { rows: existing } = await tenantPoolQuery<{ id: string }>(
    ctx.workspace.id,
    `SELECT id FROM favorites WHERE {TENANT} AND user_id = $1 AND entity_type = $2 AND entity_id = $3`,
    [ctx.user.id, entityType, entityId],
  );

  if (existing.length > 0) {
    await tenantPoolQuery(
      ctx.workspace.id,
      `DELETE FROM favorites WHERE {TENANT} AND id = $1`,
      [existing[0]!.id],
    );
    return { favorited: false };
  }

  const { rows: maxPos } = await tenantPoolQuery<{ max: number | null }>(
    ctx.workspace.id,
    `SELECT MAX(position) AS max FROM favorites WHERE {TENANT} AND user_id = $1 AND entity_type = $2`,
    [ctx.user.id, entityType],
  );
  const nextPos = (maxPos[0]?.max ?? -1) + 1;

  const id = newId();
  await tenantPoolQuery(
    ctx.workspace.id,
    `INSERT INTO favorites (id, workspace_id, user_id, entity_type, entity_id, position)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, ctx.workspace.id, ctx.user.id, entityType, entityId, nextPos],
  );
  return { favorited: true };
}
