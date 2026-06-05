import { tenantPoolQuery } from '@xpntl/db';
import type { FullAuthContext, UserRow } from '../types.js';

export type ListWorkspaceUsersOptions = {
  limit?: number;
  cursor?: string | null;
};

export type ListWorkspaceUsersResult = {
  users: UserRow[];
  nextCursor: string | null;
};

/**
 * List members of the requesting user's workspace. Workspace-scoped via the
 * standard `{TENANT}` placeholder. Cursor pagination can land later; v1
 * caps at 500 rows which is plenty for the workspaces we anticipate.
 */
export async function listWorkspaceUsers(
  ctx: FullAuthContext,
  opts: ListWorkspaceUsersOptions = {},
): Promise<ListWorkspaceUsersResult> {
  const limit =
    typeof opts.limit === 'number' && Number.isInteger(opts.limit) && opts.limit > 0
      ? Math.min(opts.limit, 500)
      : 200;
  const offset = parseCursor(opts.cursor);
  const { rows } = await tenantPoolQuery<UserRow>(
    ctx.workspace.id,
    `SELECT * FROM users
       WHERE {TENANT}
       ORDER BY display_name NULLS LAST, email ASC
       LIMIT ${limit}
      OFFSET ${offset}`,
  );
  return {
    users: rows,
    nextCursor: rows.length === limit ? String(offset + rows.length) : null,
  };
}

export async function getWorkspaceUsersByIds(
  ctx: FullAuthContext,
  userIds: readonly string[],
): Promise<Map<string, UserRow>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { rows } = await tenantPoolQuery<UserRow>(
    ctx.workspace.id,
    `SELECT * FROM users
       WHERE {TENANT} AND id = ANY($1::text[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}
