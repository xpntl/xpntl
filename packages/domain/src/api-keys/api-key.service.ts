import crypto from 'node:crypto';
import { getPool } from '@xpntl/db';
import { NotFoundError } from '../errors.js';
import type { ApiKeyRow, FullAuthContext } from '../types.js';

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateApiKey(): string {
  return `xp_live_${crypto.randomBytes(32).toString('base64url')}`;
}

export async function createApiKey(
  ctx: { workspace: { id: string } },
  userId: string,
  name: string,
  scopes: string[],
): Promise<{ key: string; record: ApiKeyRow }> {
  const raw = generateApiKey();
  const prefix = raw.slice(0, 16); // "xp_live_" + 8 random chars
  const pool = getPool();
  const { rows } = await pool.query<ApiKeyRow>(
    `INSERT INTO api_keys (workspace_id, created_by, name, prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [ctx.workspace.id, userId, name, prefix, hashKey(raw), scopes],
  );
  return { key: raw, record: rows[0]! };
}

export async function validateApiKey(
  raw: string,
): Promise<{ valid: boolean; workspaceId: string | null; userId: string | null; scopes: string[] }> {
  const pool = getPool();
  const hash = hashKey(raw);
  const { rows } = await pool.query<ApiKeyRow>(
    `SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
  if (!rows[0]) return { valid: false, workspaceId: null, userId: null, scopes: [] };

  // Check expiry
  if (rows[0].expires_at && new Date(rows[0].expires_at) < new Date()) {
    return { valid: false, workspaceId: null, userId: null, scopes: [] };
  }

  // Update last_used_at (fire-and-forget)
  pool.query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [rows[0].id]).catch(() => {});

  return {
    valid: true,
    workspaceId: rows[0].workspace_id,
    userId: rows[0].created_by,
    scopes: rows[0].scopes,
  };
}

export async function listApiKeys(
  ctx: { workspace: { id: string } },
): Promise<ApiKeyRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<ApiKeyRow>(
    `SELECT * FROM api_keys
      WHERE workspace_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [ctx.workspace.id],
  );
  return rows;
}

export async function revokeApiKey(
  ctx: { workspace: { id: string } },
  keyId: string,
): Promise<ApiKeyRow> {
  const pool = getPool();
  const { rows } = await pool.query<ApiKeyRow>(
    `UPDATE api_keys
        SET revoked_at = now()
      WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL
      RETURNING *`,
    [keyId, ctx.workspace.id],
  );
  if (!rows[0]) throw new NotFoundError('API key not found or already revoked');
  return rows[0];
}

export async function resolveApiKeyContext(raw: string): Promise<{ auth: FullAuthContext; scopes: string[] } | null> {
  const result = await validateApiKey(raw);
  if (!result.valid || !result.workspaceId || !result.userId) return null;

  const pool = getPool();

  const userRow = (await pool.query('SELECT * FROM users WHERE id = $1 AND workspace_id = $2', [result.userId, result.workspaceId]))
    .rows[0] as Record<string, unknown> | undefined;
  if (!userRow) return null;

  const wsRow = (await pool.query('SELECT * FROM workspaces WHERE id = $1', [result.workspaceId]))
    .rows[0] as Record<string, unknown> | undefined;
  if (!wsRow) return null;

  return {
    auth: {
      session: {
        id: '',
        account_id: userRow.account_id as string,
        user_id: userRow.id as string,
        workspace_id: result.workspaceId,
        token_hash: '',
        user_agent: 'api-key',
        ip: null,
        expires_at: new Date(Date.now() + 86400000),
        revoked_at: null,
        last_active_at: new Date(),
        created_at: new Date(),
      },
      account: {
        id: userRow.account_id as string,
        email: userRow.email as string,
        display_name: userRow.display_name as string | null,
        is_super_admin: false,
        is_founding: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      user: {
        id: userRow.id as string,
        workspace_id: result.workspaceId,
        account_id: userRow.account_id as string,
        email: userRow.email as string,
        display_name: userRow.display_name as string | null,
        role: (userRow.role as 'Owner' | 'Admin' | 'Member' | 'Guest') ?? 'Member',
        is_super_admin: false,
        is_agent: (userRow.is_agent as boolean) ?? false,
        agent_harness: (userRow.agent_harness as string | null) ?? null,
        avatar_url: (userRow.avatar_url as string | null) ?? null,
        last_seen_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      workspace: {
        id: result.workspaceId,
        slug: wsRow.slug as string,
        name: wsRow.name as string,
        key: wsRow.key as string,
        description: (wsRow.description as string | null) ?? null,
        disabled_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    },
    scopes: result.scopes,
  };
}
