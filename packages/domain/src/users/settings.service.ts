import { type Role, isAtLeast } from '@xpntl/auth';
import { getPool, tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { enforceSubscriptionLimits } from '../billing/gate.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import type { FullAuthContext, SessionRow, UserRow } from '../types.js';

/**
 * Stamp a user's last-active time (XP-11 presence). Called fire-and-forget from
 * the auth middleware, already throttled in-process, so this is a single
 * unconditional write — cheap.
 */
export async function touchUserSeen(workspaceId: string, userId: string): Promise<void> {
  await getPool().query(`UPDATE users SET last_seen_at = now() WHERE workspace_id = $1 AND id = $2`, [
    workspaceId,
    userId,
  ]);
}

export async function updateProfile(
  ctx: FullAuthContext,
  input: { displayName?: string; avatarUrl?: string | null },
): Promise<UserRow> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.displayName !== undefined) {
    const name = input.displayName.trim();
    if (name.length < 1 || name.length > 100) {
      throw new ValidationError('displayName must be 1-100 characters');
    }
    params.push(name);
    sets.push(`display_name = $${params.length}`);
  }

  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl !== null) {
      const url = input.avatarUrl.trim();
      if (url.length > 2000) throw new ValidationError('avatarUrl too long');
      params.push(url);
    } else {
      params.push(null);
    }
    sets.push(`avatar_url = $${params.length}`);
  }

  if (sets.length === 0) {
    const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE id = $1', [
      ctx.user.id,
    ]);
    return rows[0]!;
  }

  sets.push('updated_at = now()');
  params.push(ctx.user.id);

  const { rows } = await getPool().query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0]!;
}

export async function changePassword(
  ctx: FullAuthContext,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  if (input.newPassword.length < 12) {
    throw new ValidationError('New password must be at least 12 characters');
  }

  const { rows } = await getPool().query<{ password_hash: string }>(
    'SELECT password_hash FROM account_credentials WHERE account_id = $1',
    [ctx.account.id],
  );
  if (!rows[0]) throw new NotFoundError('No password credential found');

  const valid = await verifyPassword(rows[0].password_hash, input.currentPassword);
  if (!valid) throw new ValidationError('Current password is incorrect');

  const newHash = await hashPassword(input.newPassword);
  await getPool().query(
    'UPDATE account_credentials SET password_hash = $1, updated_at = now() WHERE account_id = $2',
    [newHash, ctx.account.id],
  );
}

export type SessionInfo = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastActiveAt: Date;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
};

export async function listUserSessions(ctx: FullAuthContext): Promise<SessionInfo[]> {
  const { rows } = await getPool().query<SessionRow>(
    `SELECT * FROM sessions
     WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_active_at DESC`,
    [ctx.account.id],
  );
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    ip: r.ip,
    lastActiveAt: r.last_active_at,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    isCurrent: r.id === ctx.session.id,
  }));
}

export async function revokeUserSession(ctx: FullAuthContext, sessionId: string): Promise<void> {
  const result = await getPool().query(
    `UPDATE sessions SET revoked_at = now()
     WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL`,
    [sessionId, ctx.account.id],
  );
  if (result.rowCount === 0) throw new NotFoundError('Session not found');
}

export async function revokeAllSessions(ctx: FullAuthContext): Promise<number> {
  const result = await getPool().query(
    `UPDATE sessions SET revoked_at = now()
     WHERE account_id = $1 AND id != $2 AND revoked_at IS NULL`,
    [ctx.account.id, ctx.session.id],
  );
  return result.rowCount ?? 0;
}

export async function updateWorkspace(
  ctx: FullAuthContext,
  input: { name?: string; description?: string | null; avatarUrl?: string | null },
): Promise<{ id: string; slug: string; name: string; key: string; description: string | null; avatar_url: string | null }> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can update workspace settings');
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 100) {
      throw new ValidationError('Workspace name must be 1-100 characters');
    }
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description?.trim() || null);
    sets.push(`description = $${params.length}`);
  }
  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl !== null) {
      const url = input.avatarUrl.trim();
      if (url.length > 2000) throw new ValidationError('avatarUrl too long');
      params.push(url);
    } else {
      params.push(null);
    }
    sets.push(`avatar_url = $${params.length}`);
  }

  if (sets.length === 0) {
    const { rows } = await getPool().query<any>('SELECT * FROM workspaces WHERE id = $1', [
      ctx.workspace.id,
    ]);
    const w = rows[0];
    return { id: w.id, slug: w.slug, name: w.name, key: w.key, description: w.description, avatar_url: w.avatar_url };
  }

  sets.push('updated_at = now()');
  params.push(ctx.workspace.id);

  const { rows } = await getPool().query<any>(
    `UPDATE workspaces SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  const w = rows[0]!;
  return { id: w.id, slug: w.slug, name: w.name, key: w.key, description: w.description, avatar_url: w.avatar_url };
}

export async function changeUserRole(
  ctx: FullAuthContext,
  input: { userId: string; newRole: Role },
): Promise<UserRow> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can change roles');
  }

  if (input.userId === ctx.user.id) {
    throw new ValidationError('Cannot change your own role');
  }

  return withTransaction(async (client) => {
    const target = await tenantClientQuery<UserRow>(
      client,
      ctx.workspace.id,
      'SELECT * FROM users WHERE {TENANT} AND id = $1 FOR UPDATE',
      [input.userId],
    );
    if (!target.rows[0]) throw new NotFoundError('User not found');

    if (target.rows[0].role === 'Owner' && input.newRole !== 'Owner') {
      const ownerCount = await tenantClientQuery<{ count: string }>(
        client,
        ctx.workspace.id,
        `SELECT count(*) as count FROM users WHERE {TENANT} AND role = 'Owner'`,
      );
      if (Number.parseInt(ownerCount.rows[0]!.count, 10) <= 1) {
        throw new ValidationError('Cannot demote the last Owner');
      }
    }

    if (input.newRole === 'Owner' && !isAtLeast(ctx.user.role, 'Owner')) {
      throw new ForbiddenError('Only owners can promote to Owner');
    }

    const result = await client.query<UserRow>(
      `UPDATE users SET role = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [input.newRole, input.userId],
    );
    return result.rows[0]!;
  });
}

export async function removeWorkspaceMember(ctx: FullAuthContext, userId: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can remove members');
  }

  if (userId === ctx.user.id) {
    throw new ValidationError('Cannot remove yourself');
  }

  return withTransaction(async (client) => {
    const target = await tenantClientQuery<UserRow>(
      client,
      ctx.workspace.id,
      'SELECT * FROM users WHERE {TENANT} AND id = $1 FOR UPDATE',
      [userId],
    );
    if (!target.rows[0]) throw new NotFoundError('User not found');

    if (target.rows[0].role === 'Owner') {
      throw new ValidationError('Cannot remove an Owner — demote first');
    }

    await client.query(
      'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND workspace_id = $2 AND revoked_at IS NULL',
      [userId, ctx.workspace.id],
    );
    // issues.creator_id / comments.author_id are NOT NULL + ON DELETE RESTRICT,
    // so reattribute a departing member's issues and comments to the remover
    // before deleting — otherwise the DELETE fails for any active member.
    await client.query(
      'UPDATE issues SET creator_id = $1 WHERE creator_id = $2 AND workspace_id = $3',
      [ctx.user.id, userId, ctx.workspace.id],
    );
    await client.query('UPDATE comments SET author_id = $1 WHERE author_id = $2', [ctx.user.id, userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });
}

export async function transferOwnership(
  ctx: FullAuthContext,
  newOwnerId: string,
): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Owner')) {
    throw new ForbiddenError('Only the workspace owner can transfer ownership');
  }

  if (newOwnerId === ctx.user.id) {
    throw new ValidationError('You are already the owner');
  }

  return withTransaction(async (client) => {
    const target = await tenantClientQuery<UserRow>(
      client,
      ctx.workspace.id,
      'SELECT * FROM users WHERE {TENANT} AND id = $1 FOR UPDATE',
      [newOwnerId],
    );
    if (!target.rows[0]) throw new NotFoundError('User not found in workspace');

    await client.query(
      `UPDATE users SET role = 'Admin', updated_at = now() WHERE id = $1`,
      [ctx.user.id],
    );
    await client.query(
      `UPDATE users SET role = 'Owner', updated_at = now() WHERE id = $1`,
      [newOwnerId],
    );
  });
}

export async function deleteWorkspace(ctx: FullAuthContext): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Owner')) {
    throw new ForbiddenError('Only the workspace owner can delete the workspace');
  }

  await getPool().query(
    'UPDATE sessions SET revoked_at = now() WHERE workspace_id = $1 AND revoked_at IS NULL',
    [ctx.workspace.id],
  );
  await getPool().query('DELETE FROM workspaces WHERE id = $1', [ctx.workspace.id]);
}

export async function inviteWorkspaceMember(
  ctx: FullAuthContext,
  input: { email: string; role?: Role; displayName?: string },
): Promise<UserRow> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can invite members');
  }
  await enforceSubscriptionLimits(ctx, 'users');

  if (!/.+@.+\..+/.test(input.email)) {
    throw new ValidationError('Invalid email address');
  }

  const role = input.role ?? 'Member';
  if (role === 'Owner' && !isAtLeast(ctx.user.role, 'Owner')) {
    throw new ForbiddenError('Only owners can invite as Owner');
  }

  return withTransaction(async (client) => {
    const existingAccount = await client.query<{
      id: string;
      email: string;
      display_name: string | null;
      is_super_admin: boolean;
    }>(
      `SELECT id, email, display_name, is_super_admin
         FROM accounts
        WHERE lower(email) = lower($1)`,
      [input.email],
    );
    let account = existingAccount.rows[0] ?? null;
    if (!account) {
      const created = await client.query<{
        id: string;
        email: string;
        display_name: string | null;
        is_super_admin: boolean;
      }>(
        `INSERT INTO accounts (email, display_name)
         VALUES (lower($1), $2)
         RETURNING id, email, display_name, is_super_admin`,
        [input.email, input.displayName?.trim() || null],
      );
      account = created.rows[0]!;

      const tempPassword = `Welcome-${Date.now()}`;
      const hash = await hashPassword(tempPassword);
      await client.query(
        `INSERT INTO account_credentials (account_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (account_id) DO NOTHING`,
        [account.id, hash],
      );
    }

    const existing = await tenantClientQuery<UserRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM users WHERE {TENANT} AND account_id = $1`,
      [account.id],
    );
    if (existing.rows[0]) {
      throw new ValidationError('A user with this email already exists in this workspace');
    }

    const result = await client.query<UserRow>(
      `INSERT INTO users (workspace_id, account_id, email, display_name, role, is_super_admin)
       VALUES ($1, $2, lower($3), $4, $5, $6)
       RETURNING *`,
      [
        ctx.workspace.id,
        account.id,
        account.email,
        input.displayName?.trim() || account.display_name,
        role,
        account.is_super_admin,
      ],
    );
    return result.rows[0]!;
  });
}
