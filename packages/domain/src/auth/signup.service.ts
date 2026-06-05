import { type PoolClient, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ConflictError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { AccountRow, SessionRow, UserRow, WorkspaceRow } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSession, upgradeSession } from './session.service.js';

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

export type RegisterInput = {
  email: string;
  password: string;
  displayName?: string;
  userAgent?: string | null;
  ip?: string | null;
};

export type RegisterResult = {
  account: AccountRow;
  session: SessionRow;
  token: string;
};

export type OnboardingInput = {
  accountId: string;
  sessionId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceKey: string;
  displayName?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

export type OnboardingResult = {
  workspace: WorkspaceRow;
  user: UserRow;
};

export type SignupInput = {
  workspaceName: string;
  workspaceSlug: string;
  workspaceKey: string;
  email: string;
  password: string;
  displayName?: string;
  userAgent?: string | null;
  ip?: string | null;
};

export type SignupResult = {
  account: AccountRow;
  workspace: WorkspaceRow;
  user: UserRow;
  session: SessionRow;
  token: string;
};

/**
 * Resolve or create an account for password-based registration.
 * - New email → creates account + password credential
 * - Existing email with password → verifies password (or throws ConflictError)
 * - Existing email without password (OAuth-only) → blocks (must sign in with SSO)
 */
async function resolveAccountForRegistration(
  client: PoolClient,
  input: { email: string; password: string; displayName?: string },
): Promise<AccountRow> {
  const { rows } = await client.query<AccountRow & { password_hash: string | null }>(
    `SELECT a.*, ac.password_hash
       FROM accounts a
       LEFT JOIN account_credentials ac ON ac.account_id = a.id
      WHERE lower(a.email) = lower($1)`,
    [input.email],
  );
  const existing = rows[0] ?? null;

  if (!existing) {
    const accountId = newId();
    const created = await client.query<AccountRow>(
      `INSERT INTO accounts (id, email, display_name)
       VALUES ($1, lower($2), $3)
       RETURNING *`,
      [accountId, input.email, input.displayName?.trim() || null],
    );
    const account = created.rows[0]!;
    const passwordHash = await hashPassword(input.password);
    await client.query(
      `INSERT INTO account_credentials (account_id, password_hash) VALUES ($1, $2)`,
      [account.id, passwordHash],
    );
    return account;
  }

  if (!existing.password_hash) {
    throw new ConflictError('An account with this email already exists. Sign in with SSO instead.');
  }

  const passwordOk = await verifyPassword(existing.password_hash, input.password);
  if (!passwordOk) throw new ConflictError('An account with this email already exists');

  return {
    id: existing.id,
    email: existing.email,
    display_name: existing.display_name,
    is_super_admin: existing.is_super_admin,
    is_founding: existing.is_founding ?? false,
    created_at: existing.created_at,
    updated_at: existing.updated_at,
  };
}

async function checkFoundingStatus(client: PoolClient, account: AccountRow): Promise<AccountRow> {
  const { rows } = await client.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM accounts WHERE is_founding = true',
  );
  if (parseInt(rows[0]?.count ?? '0', 10) < 1000) {
    await client.query('UPDATE accounts SET is_founding = true WHERE id = $1', [account.id]);
    return { ...account, is_founding: true };
  }
  return account;
}

async function seedWorkspace(
  client: PoolClient,
  input: {
    accountId: string;
    workspaceName: string;
    workspaceSlug: string;
    workspaceKey: string;
    displayName?: string | null;
    userAgent?: string | null;
    ip?: string | null;
  },
): Promise<{ workspace: WorkspaceRow; user: UserRow }> {
  const account = (
    await client.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [input.accountId])
  ).rows[0]!;

  const workspaceId = newId();
  const wsResult = await client
    .query<WorkspaceRow>(
      'INSERT INTO workspaces (id, slug, name, key) VALUES ($1, $2, $3, $4) RETURNING *',
      [workspaceId, input.workspaceSlug, input.workspaceName, input.workspaceKey],
    )
    .catch((err: Error & { code?: string }) => {
      if (err.code === '23505') throw new ConflictError('Workspace slug or key already in use');
      throw err;
    });
  const workspace = wsResult.rows[0]!;

  const userId = newId();
  const user = (
    await client.query<UserRow>(
      `INSERT INTO users (id, workspace_id, account_id, email, display_name, role, is_super_admin)
       VALUES ($1, $2, $3, lower($4), $5, 'Owner', $6)
       RETURNING *`,
      [userId, workspace.id, account.id, account.email, input.displayName ?? account.display_name ?? null, account.is_super_admin],
    )
  ).rows[0]!;

  for (const s of DEFAULT_STATES) {
    await client.query(
      'INSERT INTO workflow_states (id, workspace_id, name, type, position) VALUES ($1, $2, $3, $4, $5)',
      [newId(), workspace.id, s.name, s.type, s.position],
    );
  }

  await client.query('INSERT INTO issue_key_counters (workspace_id, last_key) VALUES ($1, 0)', [workspace.id]);

  await client.query(
    `INSERT INTO subscriptions (id, workspace_id, plan_id, status) VALUES ($1, $2, 'free', 'active') ON CONFLICT DO NOTHING`,
    [newId(), workspace.id],
  );

  await recordOnClient(client, {
    workspaceId: workspace.id,
    actorUserId: user.id,
    eventType: 'workspace.created',
    targetType: 'workspace',
    targetId: workspace.id,
    metadata: { slug: workspace.slug, key: workspace.key },
    ip: input.ip,
    userAgent: input.userAgent,
  });
  await recordOnClient(client, {
    workspaceId: workspace.id,
    actorUserId: user.id,
    eventType: 'user.created',
    targetType: 'user',
    targetId: user.id,
    metadata: { role: user.role, via: 'onboarding' },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { workspace, user };
}

/**
 * Step 1: Create account + partial session (no workspace).
 */
export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  validateEmail(input.email);
  validatePassword(input.password);

  return withTransaction(async (client) => {
    const account = await checkFoundingStatus(
      client,
      await resolveAccountForRegistration(client, input),
    );

    const { session, token } = await createSession({
      client,
      accountId: account.id,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    return { account, session, token };
  });
}

/**
 * Step 2: Create workspace from onboarding, upgrade partial session.
 */
export async function createWorkspaceFromOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  validateWorkspaceFields(input);

  return withTransaction(async (client) => {
    const { workspace, user } = await seedWorkspace(client, input);
    await upgradeSession(client, input.sessionId, user.id, workspace.id);
    return { workspace, user };
  });
}

/**
 * One-shot signup: register + create workspace in a single transaction.
 * Kept for backward compatibility with the /signup endpoint.
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  validateEmail(input.email);
  validatePassword(input.password);
  validateWorkspaceFields(input);

  return withTransaction(async (client) => {
    const account = await checkFoundingStatus(
      client,
      await resolveAccountForRegistration(client, input),
    );

    const { workspace, user } = await seedWorkspace(client, {
      ...input,
      accountId: account.id,
    });

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
      eventType: 'auth.login',
      metadata: { method: 'signup' },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { account, workspace, user, session, token };
  });
}

function validateEmail(email: string): void {
  if (!/.+@.+\..+/.test(email)) throw new ValidationError('email must be a valid email address');
}

function validatePassword(password: string): void {
  if (password.length < 12) throw new ValidationError('password must be at least 12 characters');
}

function validateWorkspaceFields(input: { workspaceName: string; workspaceSlug: string; workspaceKey: string }): void {
  if (!SLUG_RE.test(input.workspaceSlug)) {
    throw new ValidationError('workspaceSlug must be 3-40 chars, lowercase letters, digits, or hyphens');
  }
  if (!KEY_RE.test(input.workspaceKey)) {
    throw new ValidationError('workspaceKey must be 2-10 uppercase letters or digits, starting with a letter');
  }
  if (input.workspaceName.trim().length < 1 || input.workspaceName.length > 100) {
    throw new ValidationError('workspaceName must be 1-100 characters');
  }
}
