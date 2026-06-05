// TOTP multi-factor auth for email/password accounts. Secrets live in
// account_mfa; recovery codes are single-use SHA-256 hashes; login uses a
// short-lived mfa_ticket so no session is minted until the second factor passes.

import crypto from 'node:crypto';
import { getPool } from '@xpntl/db';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { UnauthorizedError, ValidationError } from '../errors.js';
import { newId } from '../id.js';

const RECOVERY_CODE_COUNT = 10;
const TICKET_TTL_MS = 5 * 60 * 1000;

// Tolerate ±1 time-step of clock skew between server and authenticator app.
authenticator.options = { window: 1 };

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Normalize a recovery code so hyphens/spaces/case don't matter. */
function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function isMfaEnabled(accountId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ enabled_at: Date | null }>(
    'SELECT enabled_at FROM account_mfa WHERE account_id = $1',
    [accountId],
  );
  return Boolean(rows[0]?.enabled_at);
}

export async function getMfaStatus(
  accountId: string,
): Promise<{ enabled: boolean; pending: boolean; recoveryCodesRemaining: number }> {
  const { rows } = await getPool().query<{ enabled_at: Date | null }>(
    'SELECT enabled_at FROM account_mfa WHERE account_id = $1',
    [accountId],
  );
  const row = rows[0];
  let recoveryCodesRemaining = 0;
  if (row?.enabled_at) {
    const r = await getPool().query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM account_mfa_recovery_codes WHERE account_id = $1 AND used_at IS NULL',
      [accountId],
    );
    recoveryCodesRemaining = Number(r.rows[0]?.n ?? 0);
  }
  return { enabled: Boolean(row?.enabled_at), pending: Boolean(row) && !row?.enabled_at, recoveryCodesRemaining };
}

export async function beginTotpEnrollment(account: {
  id: string;
  email: string;
}): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
  if (await isMfaEnabled(account.id)) {
    throw new ValidationError('Two-factor authentication is already enabled');
  }
  const secret = authenticator.generateSecret();
  await getPool().query(
    `INSERT INTO account_mfa (account_id, totp_secret, enabled_at, updated_at)
     VALUES ($1, $2, NULL, now())
     ON CONFLICT (account_id)
       DO UPDATE SET totp_secret = EXCLUDED.totp_secret, enabled_at = NULL, updated_at = now()`,
    [account.id, secret],
  );
  const otpauthUrl = authenticator.keyuri(account.email, 'xpntl', secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrDataUrl };
}

export async function confirmTotpEnrollment(
  accountId: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  const { rows } = await getPool().query<{ totp_secret: string }>(
    'SELECT totp_secret FROM account_mfa WHERE account_id = $1',
    [accountId],
  );
  const row = rows[0];
  if (!row) throw new ValidationError('Start two-factor setup first');
  if (!authenticator.check(code.trim(), row.totp_secret)) {
    throw new ValidationError('That code is incorrect — check your authenticator app and try again');
  }
  const recoveryCodes = await resetRecoveryCodes(accountId);
  await getPool().query('UPDATE account_mfa SET enabled_at = now(), updated_at = now() WHERE account_id = $1', [
    accountId,
  ]);
  return { recoveryCodes };
}

function generateRecoveryCode(): string {
  const raw = crypto.randomBytes(8).toString('hex').slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

async function resetRecoveryCodes(accountId: string): Promise<string[]> {
  await getPool().query('DELETE FROM account_mfa_recovery_codes WHERE account_id = $1', [accountId]);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  for (const code of codes) {
    await getPool().query(
      'INSERT INTO account_mfa_recovery_codes (id, account_id, code_hash) VALUES ($1, $2, $3)',
      [newId(), accountId, sha256(normalizeRecoveryCode(code))],
    );
  }
  return codes;
}

export async function regenerateRecoveryCodes(accountId: string): Promise<string[]> {
  if (!(await isMfaEnabled(accountId))) throw new ValidationError('Two-factor authentication is not enabled');
  return resetRecoveryCodes(accountId);
}

export async function disableMfa(accountId: string): Promise<void> {
  await getPool().query('DELETE FROM account_mfa_recovery_codes WHERE account_id = $1', [accountId]);
  await getPool().query('DELETE FROM account_mfa WHERE account_id = $1', [accountId]);
}

/** Login-time check: current TOTP code, else a single-use recovery code. */
export async function verifyMfaCode(accountId: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  const { rows } = await getPool().query<{ totp_secret: string; enabled_at: Date | null }>(
    'SELECT totp_secret, enabled_at FROM account_mfa WHERE account_id = $1',
    [accountId],
  );
  const row = rows[0];
  if (!row?.enabled_at) return false;
  if (authenticator.check(trimmed, row.totp_secret)) return true;

  // Atomically claim the recovery code: the `used_at IS NULL` guard in the
  // UPDATE is the single-use gate, so two concurrent requests racing the same
  // code can't both win (compare-and-swap, not check-then-set). rowCount === 1
  // means this caller burned it; 0 means no match or someone else got there.
  const hash = sha256(normalizeRecoveryCode(trimmed));
  const rc = await getPool().query(
    `UPDATE account_mfa_recovery_codes SET used_at = now()
     WHERE account_id = $1 AND code_hash = $2 AND used_at IS NULL`,
    [accountId, hash],
  );
  return (rc.rowCount ?? 0) === 1;
}

// ── Post-password challenge tickets (no session until MFA passes) ──

export async function createMfaTicket(accountId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await getPool().query(
    'INSERT INTO mfa_tickets (id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [newId(), accountId, sha256(token), new Date(Date.now() + TICKET_TTL_MS)],
  );
  return token;
}

/** Validate a ticket WITHOUT consuming it; returns the account id (throws if invalid). */
export async function peekMfaTicket(token: string): Promise<string> {
  const { rows } = await getPool().query<{ account_id: string }>(
    'SELECT account_id FROM mfa_tickets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) throw new UnauthorizedError('Your verification session expired — please sign in again');
  return row.account_id;
}

/**
 * Consume a ticket. Returns true only if THIS call claimed it — the
 * `used_at IS NULL` guard makes the ticket genuinely single-use, so a valid
 * TOTP code (which, unlike a recovery code, isn't burned on use) can't be
 * replayed by concurrent requests to mint two sessions from one ticket.
 */
export async function consumeMfaTicket(token: string): Promise<boolean> {
  const res = await getPool().query(
    'UPDATE mfa_tickets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL',
    [sha256(token)],
  );
  return (res.rowCount ?? 0) === 1;
}
