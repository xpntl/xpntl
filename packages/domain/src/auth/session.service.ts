import crypto from 'node:crypto';
import { type PoolClient, getPool } from '@xpntl/db';
import { newId } from '../id.js';
import type { AccountRow, AuthContext, FullAuthContext, PartialAuthContext, SessionRow, UserRow, WorkspaceRow } from '../types.js';

const SESSION_DURATION_DAYS = 30;

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type CreateSessionInput = {
  client: PoolClient;
  accountId: string;
  userId?: string | null;
  workspaceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

export async function createSession(
  input: CreateSessionInput,
): Promise<{ session: SessionRow; token: string }> {
  const id = newId();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const { rows } = await input.client.query<SessionRow>(
    `INSERT INTO sessions
       (id, account_id, user_id, workspace_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      input.accountId,
      input.userId,
      input.workspaceId,
      tokenHash,
      input.userAgent ?? null,
      input.ip ?? null,
      expiresAt,
    ],
  );

  const session = rows[0];
  if (!session) throw new Error('Failed to create session');
  return { session, token };
}

/**
 * Look up a session by its plaintext token. Returns PartialAuthContext when the
 * session has no workspace yet (onboarding state), FullAuthContext otherwise.
 */
export async function findSessionByToken(token: string): Promise<AuthContext | null> {
  const tokenHash = hashSessionToken(token);
  const { rows } = await getPool().query<
    SessionRow & {
      account_email: string;
      account_display_name: string | null;
      account_is_super_admin: boolean;
      account_is_founding: boolean;
      account_created_at: Date;
      account_updated_at: Date;
      user_id_resolved: string | null;
      user_email: string | null;
      user_display_name: string | null;
      user_role: UserRow['role'] | null;
      user_is_super_admin: boolean | null;
      user_is_agent: boolean | null;
      user_agent_harness: string | null;
      user_avatar_url: string | null;
      user_created_at: Date | null;
      user_updated_at: Date | null;
      workspace_id_resolved: string | null;
      workspace_slug: string | null;
      workspace_name: string | null;
      workspace_key: string | null;
      workspace_description: string | null;
      workspace_disabled_at: Date | null;
      workspace_created_at: Date | null;
      workspace_updated_at: Date | null;
    }
  >(
    `SELECT
       s.*,
       a.email           AS account_email,
       a.display_name    AS account_display_name,
       a.is_super_admin  AS account_is_super_admin,
       a.is_founding     AS account_is_founding,
       a.created_at      AS account_created_at,
       a.updated_at      AS account_updated_at,
       u.id              AS user_id_resolved,
       u.email           AS user_email,
       u.display_name    AS user_display_name,
       u.role            AS user_role,
       u.is_super_admin  AS user_is_super_admin,
       u.is_agent        AS user_is_agent,
       u.agent_harness   AS user_agent_harness,
       u.avatar_url      AS user_avatar_url,
       u.created_at      AS user_created_at,
       u.updated_at      AS user_updated_at,
       w.id              AS workspace_id_resolved,
       w.slug            AS workspace_slug,
       w.name            AS workspace_name,
       w.key             AS workspace_key,
       w.description     AS workspace_description,
       w.disabled_at     AS workspace_disabled_at,
       w.created_at      AS workspace_created_at,
       w.updated_at      AS workspace_updated_at
     FROM sessions s
     JOIN accounts a        ON a.id = s.account_id
     LEFT JOIN users u      ON u.id = s.user_id
     LEFT JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND s.revoked_at IS NULL`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row) return null;

  const session: SessionRow = {
    id: row.id,
    account_id: row.account_id,
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    token_hash: row.token_hash,
    user_agent: row.user_agent,
    ip: row.ip,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_active_at: row.last_active_at,
    created_at: row.created_at,
  };

  const account: AccountRow = {
    id: row.account_id,
    email: row.account_email,
    display_name: row.account_display_name,
    is_super_admin: row.account_is_super_admin,
    is_founding: row.account_is_founding,
    created_at: row.account_created_at,
    updated_at: row.account_updated_at,
  };

  if (!row.user_id_resolved || !row.workspace_id_resolved) {
    return { session, account, user: null, workspace: null } satisfies PartialAuthContext;
  }

  return {
    session,
    account,
    user: {
      id: row.user_id_resolved,
      workspace_id: row.workspace_id_resolved,
      account_id: row.account_id,
      email: row.user_email!,
      display_name: row.user_display_name,
      role: row.user_role!,
      is_super_admin: row.user_is_super_admin!,
      is_agent: row.user_is_agent!,
      agent_harness: row.user_agent_harness,
      avatar_url: row.user_avatar_url ?? null,
      last_seen_at: null,
      created_at: row.user_created_at!,
      updated_at: row.user_updated_at!,
    },
    workspace: {
      id: row.workspace_id_resolved,
      slug: row.workspace_slug!,
      name: row.workspace_name!,
      key: row.workspace_key!,
      description: row.workspace_description,
      disabled_at: row.workspace_disabled_at,
      created_at: row.workspace_created_at!,
      updated_at: row.workspace_updated_at!,
    },
  } satisfies FullAuthContext;
}

export async function upgradeSession(
  client: PoolClient,
  sessionId: string,
  userId: string,
  workspaceId: string,
): Promise<void> {
  await client.query(
    'UPDATE sessions SET user_id = $1, workspace_id = $2 WHERE id = $3',
    [userId, workspaceId, sessionId],
  );
}

/**
 * Extend a session's expiry by SESSION_DURATION_DAYS from now.
 * Called by auth middleware, throttled so we only write once per hour.
 */
export async function touchSession(sessionId: string): Promise<void> {
  const newExpiry = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await getPool().query(
    `UPDATE sessions SET expires_at = $1, last_active_at = now()
     WHERE id = $2 AND revoked_at IS NULL
       AND expires_at < $1`,
    [newExpiry, sessionId],
  );
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getPool().query(
    'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [sessionId],
  );
}
