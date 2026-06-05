import { withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { UnauthorizedError } from '../errors.js';
import type { AccountRow, SessionRow, UserRow, WorkspaceRow } from '../types.js';
import {
  ensureAccountForSignin,
  getAccountById,
  listMembershipsForAccount,
} from './account.service.js';
import {
  consumeMfaTicket,
  createMfaTicket,
  isMfaEnabled,
  peekMfaTicket,
  verifyMfaCode,
} from './mfa.service.js';
import { createSession } from './session.service.js';

export type LoginInput = {
  workspaceId?: string | null;
  email: string;
  password: string;
  userAgent?: string | null;
  ip?: string | null;
};

export type LoginResult =
  | { kind: 'session'; account: AccountRow; workspace: WorkspaceRow; user: UserRow; session: SessionRow; token: string }
  | { kind: 'choose'; account: AccountRow; memberships: Array<{ workspace: WorkspaceRow; user: UserRow }>; session: SessionRow; token: string }
  | { kind: 'onboarding'; account: AccountRow; session: SessionRow; token: string }
  | { kind: 'mfa'; account: AccountRow; mfaTicket: string };

type ResolveOpts = {
  workspaceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  method: 'password' | 'mfa' | 'passkey';
};

/**
 * Shared post-authentication path: pick a workspace (or onboarding/choose) and
 * mint the session. Used after a clean password login AND after a passed MFA
 * challenge. Credentials are never checked here.
 */
async function resolveLogin(
  account: AccountRow,
  opts: ResolveOpts,
): Promise<Exclude<LoginResult, { kind: 'mfa' }>> {
  const memberships = await listMembershipsForAccount(account.id);

  if (memberships.length === 0) {
    return withTransaction(async (client) => {
      const { session, token } = await createSession({
        client,
        accountId: account.id,
        userAgent: opts.userAgent,
        ip: opts.ip,
      });
      return { kind: 'onboarding', account, session, token };
    });
  }

  const match = opts.workspaceId?.trim()
    ? memberships.find((entry) => entry.workspace.id === opts.workspaceId)
    : null;
  const selected = match ?? (memberships.length === 1 ? memberships[0] : null);

  if (!selected) {
    return withTransaction(async (client) => {
      const { session, token } = await createSession({
        client,
        accountId: account.id,
        userAgent: opts.userAgent,
        ip: opts.ip,
      });
      return { kind: 'choose', account, memberships, session, token };
    });
  }

  return withTransaction(async (client) => {
    const { session, token } = await createSession({
      client,
      accountId: account.id,
      userId: selected.user.id,
      workspaceId: selected.workspace.id,
      userAgent: opts.userAgent,
      ip: opts.ip,
    });

    await recordOnClient(client, {
      workspaceId: selected.workspace.id,
      actorUserId: selected.user.id,
      eventType: 'auth.login',
      metadata: { method: opts.method },
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    return { kind: 'session', account, workspace: selected.workspace, user: selected.user, session, token };
  });
}

/**
 * Verify credentials and open a session. Always returns a generic
 * "Invalid credentials" error on any failure; never leak which side was wrong.
 * When the account has MFA enabled, returns a 'mfa' challenge with a short-lived
 * ticket and DOES NOT mint a session — a stolen password alone gets nothing.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const account = await ensureAccountForSignin(input.email, input.password);

  if (await isMfaEnabled(account.id)) {
    const mfaTicket = await createMfaTicket(account.id);
    return { kind: 'mfa', account, mfaTicket };
  }

  return resolveLogin(account, {
    workspaceId: input.workspaceId,
    userAgent: input.userAgent,
    ip: input.ip,
    method: 'password',
  });
}

/**
 * Second step of an MFA login: validate the ticket + the TOTP/recovery code,
 * then mint the session (same outcomes as a normal login). The ticket is only
 * consumed once the code verifies, so a wrong code can be retried in-window.
 */
export async function completeMfaLogin(input: {
  mfaTicket: string;
  code: string;
  workspaceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<Exclude<LoginResult, { kind: 'mfa' }>> {
  const accountId = await peekMfaTicket(input.mfaTicket);
  const ok = await verifyMfaCode(accountId, input.code);
  if (!ok) throw new UnauthorizedError('That code is incorrect');
  // Claim the ticket atomically; if a concurrent request already burned it,
  // fail closed rather than minting a second session from one ticket.
  const claimed = await consumeMfaTicket(input.mfaTicket);
  if (!claimed) throw new UnauthorizedError('Your verification session expired — please sign in again');

  const account = await getAccountById(accountId);
  if (!account) throw new UnauthorizedError('Account not found');

  return resolveLogin(account, {
    workspaceId: input.workspaceId,
    userAgent: input.userAgent,
    ip: input.ip,
    method: 'mfa',
  });
}

/**
 * Open a session for an account that just proved possession of a passkey.
 * The assertion is verified by the passkey service before this is called.
 * Passkeys are themselves a strong factor, so MFA is not additionally required.
 */
export async function completePasskeyLogin(input: {
  accountId: string;
  workspaceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<Exclude<LoginResult, { kind: 'mfa' }>> {
  const account = await getAccountById(input.accountId);
  if (!account) throw new UnauthorizedError('Account not found');
  return resolveLogin(account, {
    workspaceId: input.workspaceId,
    userAgent: input.userAgent,
    ip: input.ip,
    method: 'passkey',
  });
}
