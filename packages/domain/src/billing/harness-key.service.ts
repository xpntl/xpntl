import crypto from 'node:crypto';
import { getPool } from '@xpntl/db';
import { NotFoundError } from '../errors.js';
import { newId } from '../id.js';
import type { CodingHarnessKeyRow, FullAuthContext } from '../types.js';
import { enforceSubscriptionLimits } from './gate.js';

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateHarnessKey(): string {
  return `xpntl_hk_${crypto.randomBytes(24).toString('base64url')}`;
}

export async function createHarnessKey(
  ctx: { workspace: { id: string } },
  name: string,
  createdBy: string,
  agentUserId?: string,
): Promise<{ key: string; record: CodingHarnessKeyRow }> {
  await enforceSubscriptionLimits(ctx, 'harness_keys');

  const raw = generateHarnessKey();
  const prefix = raw.slice(0, 12);
  const pool = getPool();
  const id = newId();
  const { rows } = await pool.query<CodingHarnessKeyRow>(
    `INSERT INTO coding_harness_keys (id, workspace_id, name, key_prefix, key_hash, created_by, agent_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, ctx.workspace.id, name, prefix, hashKey(raw), createdBy, agentUserId ?? null],
  );
  return { key: raw, record: rows[0]! };
}

export async function listHarnessKeys(
  ctx: { workspace: { id: string } },
): Promise<CodingHarnessKeyRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<CodingHarnessKeyRow>(
    `SELECT * FROM coding_harness_keys
      WHERE workspace_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [ctx.workspace.id],
  );
  return rows;
}

export async function revokeHarnessKey(
  ctx: { workspace: { id: string } },
  keyId: string,
): Promise<CodingHarnessKeyRow> {
  const pool = getPool();
  const { rows } = await pool.query<CodingHarnessKeyRow>(
    `UPDATE coding_harness_keys
        SET revoked_at = now()
      WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL
      RETURNING *`,
    [keyId, ctx.workspace.id],
  );
  if (!rows[0]) throw new NotFoundError('Harness key not found or already revoked');
  return rows[0];
}

export async function validateHarnessKey(
  raw: string,
): Promise<{ valid: boolean; workspaceId: string | null; agentUserId: string | null }> {
  const pool = getPool();
  const { rows } = await pool.query<CodingHarnessKeyRow>(
    `SELECT * FROM coding_harness_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hashKey(raw)],
  );
  if (!rows[0]) return { valid: false, workspaceId: null, agentUserId: null };

  await pool.query('UPDATE coding_harness_keys SET last_used_at = now() WHERE id = $1', [rows[0].id]);
  return { valid: true, workspaceId: rows[0].workspace_id, agentUserId: rows[0].agent_user_id };
}

export async function resolveHarnessKeyContext(raw: string): Promise<FullAuthContext | null> {
  const result = await validateHarnessKey(raw);
  if (!result.valid || !result.workspaceId) return null;

  const pool = getPool();

  const userQuery = result.agentUserId
    ? `SELECT * FROM users WHERE id = $1 AND workspace_id = $2`
    : `SELECT * FROM users WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1`;
  const userParams = result.agentUserId
    ? [result.agentUserId, result.workspaceId]
    : [result.workspaceId];
  const userRow = (await pool.query(userQuery, userParams)).rows[0] as Record<string, unknown> | undefined;
  if (!userRow) return null;

  const wsRow = (await pool.query('SELECT * FROM workspaces WHERE id = $1', [result.workspaceId]))
    .rows[0] as Record<string, unknown> | undefined;
  if (!wsRow) return null;

  return {
    session: {
      id: '',
      account_id: userRow.account_id as string,
      user_id: userRow.id as string,
      workspace_id: result.workspaceId,
      token_hash: '',
      user_agent: 'harness-key',
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
  };
}
