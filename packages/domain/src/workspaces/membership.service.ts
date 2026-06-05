import { getPool, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { AuthContext, FullAuthContext, SessionRow, UserRow, WorkspaceRow } from '../types.js';
import { createSession } from '../auth/session.service.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

const DEFAULT_STATES: Array<{ name: string; type: string; position: number }> = [
  { name: 'Triage', type: 'triage', position: 1 },
  { name: 'Backlog', type: 'backlog', position: 2 },
  { name: 'Ready', type: 'unstarted', position: 3 },
  { name: 'In Progress', type: 'started', position: 4 },
  { name: 'Review', type: 'review', position: 5 },
  { name: 'Done', type: 'completed', position: 6 },
  { name: 'Canceled', type: 'canceled', position: 7 },
];

export type WorkspaceMembership = {
  workspace: WorkspaceRow & { avatar_url: string | null };
  user: UserRow;
  isCurrent: boolean;
  isDefault: boolean;
};

export async function listAccountWorkspaceMemberships(
  ctx: AuthContext,
): Promise<WorkspaceMembership[]> {
  const { rows } = await queryMemberships(ctx.account.id);
  return rows.map((row) => ({
    workspace: {
      id: row.workspace_id,
      slug: row.workspace_slug,
      name: row.workspace_name,
      key: row.workspace_key,
      description: row.workspace_description,
      disabled_at: row.workspace_disabled_at,
      created_at: row.workspace_created_at,
      updated_at: row.workspace_updated_at,
      avatar_url: row.workspace_avatar_url,
    },
    user: {
      id: row.id,
      workspace_id: row.workspace_id,
      account_id: row.account_id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
      is_super_admin: row.is_super_admin,
      is_agent: row.is_agent ?? false,
      agent_harness: row.agent_harness ?? null,
      avatar_url: row.avatar_url ?? null,
      last_seen_at: row.last_seen_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    isCurrent: row.workspace_id === ctx.workspace?.id,
    isDefault: row.account_default_workspace_id != null && row.workspace_id === row.account_default_workspace_id,
  }));
}

/**
 * Set (or clear, with null) the account's default workspace. The sign-in
 * chooser auto-selects this workspace on subsequent logins. Validates the
 * account is actually a member before storing.
 */
export async function setDefaultWorkspace(
  ctx: AuthContext,
  workspaceId: string | null,
): Promise<void> {
  const accountId = ctx.account.id;
  if (workspaceId) {
    const { rowCount } = await getPool().query(
      `SELECT 1 FROM users WHERE account_id = $1 AND workspace_id = $2`,
      [accountId, workspaceId],
    );
    if (!rowCount) {
      throw new NotFoundError('Workspace membership not found');
    }
  }
  await getPool().query(
    `UPDATE accounts SET default_workspace_id = $2, updated_at = now() WHERE id = $1`,
    [accountId, workspaceId],
  );
}

export async function switchWorkspaceForAccount(
  ctx: FullAuthContext,
  input: {
    workspaceId?: string;
    workspaceSlug?: string;
    userAgent?: string | null;
    ip?: string | null;
  },
): Promise<{ workspace: WorkspaceRow; user: UserRow; session: SessionRow; token: string }> {
  const memberships = await listAccountWorkspaceMemberships(ctx);
  const target = memberships.find(
    (entry) =>
      entry.workspace.id === input.workspaceId ||
      (input.workspaceSlug ? entry.workspace.slug === input.workspaceSlug : false),
  );
  if (!target) throw new NotFoundError('Workspace membership not found');

  return withTransaction(async (client) => {
    const { session, token } = await createSession({
      client,
      accountId: ctx.account.id,
      userId: target.user.id,
      workspaceId: target.workspace.id,
      userAgent: input.userAgent,
      ip: input.ip,
    });
    return { workspace: target.workspace, user: target.user, session, token };
  });
}

/**
 * Accept a workspace invitation by its emailed token (XP-114). Creates the
 * membership (idempotently) for the signed-in account and returns a session
 * bound to the joined workspace — the same `{ workspace, user, token }` shape
 * as a workspace switch, so the client can drop straight into the workspace.
 *
 * Takes a plain AuthContext (works in a partial, pre-workspace session too)
 * because the invite points at a workspace the caller is not yet a member of.
 */
export async function acceptWorkspaceInvite(
  ctx: AuthContext,
  input: { token: string; userAgent?: string | null; ip?: string | null },
): Promise<{ workspace: WorkspaceRow; user: UserRow; session: SessionRow; token: string }> {
  const account = ctx.account;
  const inviteToken = input.token?.trim();
  if (!inviteToken) throw new ValidationError('An invitation token is required');

  // Look the invite up by token alone — it points at a workspace the caller is
  // (usually) not yet a member of, so this is deliberately NOT tenant-scoped.
  const { rows } = await getPool().query<{
    id: string;
    workspace_id: string;
    email: string;
    role: string;
  }>('SELECT id, workspace_id, email, role FROM workspace_invites WHERE token = $1', [inviteToken]);
  const invite = rows[0];
  if (!invite) {
    throw new NotFoundError('This invitation is invalid, expired, or has already been used.');
  }

  // A leaked link must not let a different account join: the signed-in account's
  // email must match the address the invite was sent to.
  if (invite.email.toLowerCase() !== account.email.toLowerCase()) {
    throw new ForbiddenError(
      `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`,
    );
  }

  return withTransaction(async (client) => {
    const wsResult = await client.query<WorkspaceRow>('SELECT * FROM workspaces WHERE id = $1', [
      invite.workspace_id,
    ]);
    const workspace = wsResult.rows[0];
    if (!workspace) throw new NotFoundError('That workspace no longer exists.');

    // Idempotent join: reuse an existing membership, else create one with the
    // invited role. The unique (workspace_id, account_id) index guards races.
    let user = (
      await client.query<UserRow>(
        'SELECT * FROM users WHERE workspace_id = $1 AND account_id = $2',
        [workspace.id, account.id],
      )
    ).rows[0];

    if (!user) {
      try {
        user = (
          await client.query<UserRow>(
            `INSERT INTO users (id, workspace_id, account_id, email, display_name, role, is_super_admin)
             VALUES ($1, $2, $3, lower($4), $5, $6, $7)
             RETURNING *`,
            [
              newId(),
              workspace.id,
              account.id,
              account.email,
              account.display_name ?? null,
              invite.role,
              account.is_super_admin,
            ],
          )
        ).rows[0];
      } catch (err) {
        // Lost a race with a concurrent accept — fall back to the existing row.
        if ((err as { code?: string }).code !== '23505') throw err;
        user = (
          await client.query<UserRow>(
            'SELECT * FROM users WHERE workspace_id = $1 AND account_id = $2',
            [workspace.id, account.id],
          )
        ).rows[0];
      }
    }
    if (!user) throw new NotFoundError('Could not establish workspace membership.');

    // Consume the invite so the link can't be replayed.
    await client.query('DELETE FROM workspace_invites WHERE id = $1', [invite.id]);

    const { session, token } = await createSession({
      client,
      accountId: account.id,
      userId: user.id,
      workspaceId: workspace.id,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    await recordOnClient(client, {
      workspaceId: workspace.id,
      actorUserId: user.id,
      eventType: 'workspace.member_joined',
      targetType: 'user',
      targetId: user.id,
      metadata: { via: 'invite', role: invite.role },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { workspace, user, session, token };
  });
}

const MAX_FREE_WORKSPACES = 1;

export async function createWorkspaceForAccount(
  ctx: FullAuthContext,
  input: {
    workspaceName: string;
    workspaceSlug: string;
    workspaceKey: string;
    displayName?: string | null;
    userAgent?: string | null;
    ip?: string | null;
  },
): Promise<{ workspace: WorkspaceRow; user: UserRow; session: SessionRow; token: string }> {
  if (!ctx.account.id) throw new ForbiddenError('Sign in to continue');
  validateWorkspaceInput(input);

  const pool = getPool();
  const { rows: owned } = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM users WHERE account_id = $1 AND role = 'Owner'`,
    [ctx.account.id],
  );
  const ownedCount = Number(owned[0]?.cnt ?? 0);

  if (ownedCount >= MAX_FREE_WORKSPACES) {
    const { getWorkspaceSubscription } = await import('../billing/gate.js');
    const sub = await getWorkspaceSubscription({ workspace: ctx.workspace });
    const planId = sub.plan_id;
    if (planId === 'free') {
      throw new ForbiddenError(
        'Your Free plan allows 1 workspace. Upgrade to Pro or Ultra to create more.',
      );
    }
  }

  return withTransaction(async (client) => {
    const workspaceId = newId();
    const wsResult = await client
      .query<WorkspaceRow>(
        `INSERT INTO workspaces (id, slug, name, key) VALUES ($1, $2, $3, $4) RETURNING *`,
        [workspaceId, input.workspaceSlug, input.workspaceName, input.workspaceKey],
      )
      .catch((err: Error & { code?: string }) => {
        if (err.code === '23505') {
          throw new ValidationError('Workspace slug or key already in use');
        }
        throw err;
      });
    const workspace = wsResult.rows[0]!;

    const userId = newId();
    const userResult = await client.query<UserRow>(
      `INSERT INTO users (id, workspace_id, account_id, email, display_name, role, is_super_admin)
       VALUES ($1, $2, $3, lower($4), $5, 'Owner', $6)
       RETURNING *`,
      [
        userId,
        workspace.id,
        ctx.account.id,
        ctx.account.email,
        input.displayName?.trim() || ctx.user.display_name || ctx.account.display_name || null,
        ctx.account.is_super_admin,
      ],
    );
    const user = userResult.rows[0]!;

    for (const s of DEFAULT_STATES) {
      const stateId = newId();
      await client.query(
        `INSERT INTO workflow_states (id, workspace_id, name, type, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [stateId, workspace.id, s.name, s.type, s.position],
      );
    }

    await client.query(`INSERT INTO issue_key_counters (workspace_id, last_key) VALUES ($1, 0)`, [
      workspace.id,
    ]);

    const { session, token } = await createSession({
      client,
      accountId: ctx.account.id,
      userId: user.id,
      workspaceId: workspace.id,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    await recordOnClient(client, {
      workspaceId: workspace.id,
      actorUserId: user.id,
      eventType: 'workspace.created',
      targetType: 'workspace',
      targetId: workspace.id,
      metadata: { slug: workspace.slug, key: workspace.key, via: 'authenticated-account' },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { workspace, user, session, token };
  });
}

type MembershipQueryRow = UserRow & {
  workspace_slug: string;
  workspace_name: string;
  workspace_key: string;
  workspace_description: string | null;
  workspace_disabled_at: Date | null;
  workspace_created_at: Date;
  workspace_updated_at: Date;
  workspace_avatar_url: string | null;
  account_default_workspace_id: string | null;
};

function queryMemberships(accountId: string) {
  return getPool().query<MembershipQueryRow>(
    `SELECT
       u.*,
       w.slug        AS workspace_slug,
       w.name        AS workspace_name,
       w.key         AS workspace_key,
       w.description AS workspace_description,
       w.disabled_at AS workspace_disabled_at,
       w.created_at  AS workspace_created_at,
       w.updated_at  AS workspace_updated_at,
       w.avatar_url  AS workspace_avatar_url,
       a.default_workspace_id AS account_default_workspace_id
     FROM users u
     JOIN workspaces w ON w.id = u.workspace_id
     JOIN accounts a ON a.id = u.account_id
     WHERE u.account_id = $1
     ORDER BY (w.id = a.default_workspace_id) DESC, w.name ASC`,
    [accountId],
  );
}

function validateWorkspaceInput(input: {
  workspaceName: string;
  workspaceSlug: string;
  workspaceKey: string;
}) {
  if (!SLUG_RE.test(input.workspaceSlug)) {
    throw new ValidationError(
      'workspaceSlug must be 3-40 chars, lowercase letters, digits, or hyphens',
    );
  }
  if (!KEY_RE.test(input.workspaceKey)) {
    throw new ValidationError(
      'workspaceKey must be 2-10 uppercase letters or digits, starting with a letter',
    );
  }
  if (input.workspaceName.trim().length < 1 || input.workspaceName.length > 100) {
    throw new ValidationError('workspaceName must be 1-100 characters');
  }
}
