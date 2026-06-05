import { getPool } from '@xpntl/db';
import { UnauthorizedError } from '../errors.js';
import { newId } from '../id.js';
import type { AccountRow, UserRow, WorkspaceRow } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';

type AccountLookupRow = AccountRow & { password_hash: string | null };

export async function findAccountByEmail(email: string): Promise<AccountLookupRow | null> {
  const { rows } = await getPool().query<AccountLookupRow>(
    `SELECT a.*, ac.password_hash
       FROM accounts a
       LEFT JOIN account_credentials ac ON ac.account_id = a.id
      WHERE lower(a.email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getAccountById(accountId: string): Promise<AccountRow | null> {
  const { rows } = await getPool().query<AccountLookupRow>('SELECT * FROM accounts WHERE id = $1', [accountId]);
  return rows[0] ? stripPassword(rows[0]) : null;
}

export async function ensureAccountForSignin(email: string, password: string): Promise<AccountRow> {
  const account = await findAccountByEmail(email);
  if (!account?.password_hash) throw new UnauthorizedError('Invalid credentials');
  const passwordOk = await verifyPassword(account.password_hash, password);
  if (!passwordOk) throw new UnauthorizedError('Invalid credentials');
  return stripPassword(account);
}

export async function createAccount(input: {
  email: string;
  password: string;
  displayName?: string | null;
  isSuperAdmin?: boolean;
}): Promise<AccountRow> {
  const id = newId();
  const passwordHash = await hashPassword(input.password);
  const { rows } = await getPool().query<AccountRow>(
    `INSERT INTO accounts (id, email, display_name, is_super_admin)
     VALUES ($1, lower($2), $3, $4)
     RETURNING *`,
    [id, input.email, input.displayName?.trim() || null, input.isSuperAdmin ?? false],
  );
  const account = rows[0]!;
  await getPool().query(
    `INSERT INTO account_credentials (account_id, password_hash)
     VALUES ($1, $2)`,
    [account.id, passwordHash],
  );
  return account;
}

export async function ensureAccountForSignup(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<AccountRow> {
  const existing = await findAccountByEmail(input.email);
  if (!existing) {
    return createAccount(input);
  }
  if (!existing.password_hash) {
    const passwordHash = await hashPassword(input.password);
    await getPool().query(
      `INSERT INTO account_credentials (account_id, password_hash)
       VALUES ($1, $2)`,
      [existing.id, passwordHash],
    );
  } else {
    const passwordOk = await verifyPassword(existing.password_hash, input.password);
    if (!passwordOk) throw new UnauthorizedError('Invalid credentials');
  }
  return stripPassword(existing);
}

export async function listMembershipsForAccount(
  accountId: string,
): Promise<Array<{ workspace: WorkspaceRow; user: UserRow }>> {
  const { rows } = await getPool().query<
    UserRow & {
      workspace_slug: string;
      workspace_name: string;
      workspace_key: string;
      workspace_description: string | null;
      workspace_disabled_at: Date | null;
      workspace_created_at: Date;
      workspace_updated_at: Date;
    }
  >(
    `SELECT
       u.*,
       w.slug        AS workspace_slug,
       w.name        AS workspace_name,
       w.key         AS workspace_key,
       w.description AS workspace_description,
       w.disabled_at AS workspace_disabled_at,
       w.created_at  AS workspace_created_at,
       w.updated_at  AS workspace_updated_at
     FROM users u
     JOIN workspaces w ON w.id = u.workspace_id
     WHERE u.account_id = $1
     ORDER BY w.name ASC`,
    [accountId],
  );
  return rows.map((row) => ({
    user: row,
    workspace: {
      id: row.workspace_id,
      slug: row.workspace_slug,
      name: row.workspace_name,
      key: row.workspace_key,
      description: row.workspace_description,
      disabled_at: row.workspace_disabled_at,
      created_at: row.workspace_created_at,
      updated_at: row.workspace_updated_at,
    },
  }));
}

function stripPassword(row: AccountLookupRow): AccountRow {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    is_super_admin: row.is_super_admin,
    is_founding: (row as AccountRow).is_founding ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
