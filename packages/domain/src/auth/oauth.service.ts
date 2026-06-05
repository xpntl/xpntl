import { withTransaction } from '@xpntl/db';
import { newId } from '../id.js';
import type { AccountRow } from '../types.js';
import { createSession } from './session.service.js';
import { listMembershipsForAccount } from './account.service.js';
import type { LoginResult } from './login.service.js';

export type OAuthProfile = {
  provider: 'google' | 'github' | 'microsoft' | 'apple';
  providerAccountId: string;
  email: string;
  displayName?: string | null;
};

// SSO is its own factor — OAuth logins are not re-challenged for app-MFA, so
// this never returns the 'mfa' variant.
export async function handleOAuthCallback(
  profile: OAuthProfile,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<Exclude<LoginResult, { kind: 'mfa' }>> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ account_id: string }>(
      `SELECT ap.account_id FROM account_providers ap
       WHERE ap.provider = $1 AND ap.provider_account_id = $2`,
      [profile.provider, profile.providerAccountId],
    );

    let account: AccountRow;

    if (existing.rows[0]) {
      account = (await client.query<AccountRow>(
        'SELECT * FROM accounts WHERE id = $1',
        [existing.rows[0].account_id],
      )).rows[0]!;
    } else {
      const byEmail = await client.query<AccountRow>(
        'SELECT * FROM accounts WHERE lower(email) = lower($1)',
        [profile.email],
      );

      if (byEmail.rows[0]) {
        account = byEmail.rows[0];
        await client.query(
          `INSERT INTO account_providers (account_id, provider, provider_account_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [account.id, profile.provider, profile.providerAccountId],
        );
      } else {
        const id = newId();
        account = (await client.query<AccountRow>(
          `INSERT INTO accounts (id, email, display_name) VALUES ($1, lower($2), $3) RETURNING *`,
          [id, profile.email, profile.displayName ?? null],
        )).rows[0]!;
        await client.query(
          `INSERT INTO account_providers (account_id, provider, provider_account_id)
           VALUES ($1, $2, $3)`,
          [id, profile.provider, profile.providerAccountId],
        );
      }
    }

    const memberships = await listMembershipsForAccount(account.id);

    if (memberships.length === 0) {
      const { session, token } = await createSession({
        client,
        accountId: account.id,
        userAgent: meta.userAgent,
        ip: meta.ip,
      });
      return { kind: 'onboarding', account, session, token };
    }

    if (memberships.length > 1) {
      const { session, token } = await createSession({
        client,
        accountId: account.id,
        userAgent: meta.userAgent,
        ip: meta.ip,
      });
      return { kind: 'choose', account, memberships, session, token };
    }

    const selected = memberships[0]!;
    const { session, token } = await createSession({
      client,
      accountId: account.id,
      userId: selected.user.id,
      workspaceId: selected.workspace.id,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return { kind: 'session', account, workspace: selected.workspace, user: selected.user, session, token };
  });
}
