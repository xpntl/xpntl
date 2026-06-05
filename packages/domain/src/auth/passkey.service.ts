// WebAuthn passkeys (PER-28) via @simplewebauthn/server. Credentials are stored
// per account; challenges are single-use rows so the register/authenticate
// round-trips are safe across replicas (no shared-secret or cookie needed).

import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getPool } from '@xpntl/db';
import { UnauthorizedError, ValidationError } from '../errors.js';
import { newId } from '../id.js';

const RP_NAME = 'xpntl';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rpID(): string {
  return process.env.WEBAUTHN_RP_ID ?? 'app.xpntl.dev';
}
function expectedOrigins(): string[] {
  return (process.env.WEBAUTHN_ORIGIN ?? 'https://app.xpntl.dev')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type CredentialRow = {
  id: string;
  account_id: string;
  credential_id: string;
  public_key: string;
  counter: string; // bigint comes back as string
  transports: string[];
  name: string | null;
  created_at: Date;
  last_used_at: Date | null;
};

async function saveChallenge(kind: 'register' | 'authenticate', challenge: string, accountId: string | null): Promise<string> {
  const id = newId();
  await getPool().query(
    'INSERT INTO webauthn_challenges (id, account_id, challenge, kind, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [id, accountId, challenge, kind, new Date(Date.now() + CHALLENGE_TTL_MS)],
  );
  return id;
}

async function takeChallenge(
  id: string,
  kind: 'register' | 'authenticate',
): Promise<{ challenge: string; accountId: string | null }> {
  const { rows } = await getPool().query<{ challenge: string; account_id: string | null }>(
    'DELETE FROM webauthn_challenges WHERE id = $1 AND kind = $2 AND expires_at > now() RETURNING challenge, account_id',
    [id, kind],
  );
  const row = rows[0];
  if (!row) throw new ValidationError('Your passkey challenge expired — please try again');
  return { challenge: row.challenge, accountId: row.account_id };
}

// ── Settings: list / rename / delete ──

export async function listPasskeys(accountId: string) {
  const { rows } = await getPool().query<CredentialRow>(
    'SELECT * FROM webauthn_credentials WHERE account_id = $1 ORDER BY created_at DESC',
    [accountId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    transports: r.transports,
  }));
}

export async function deletePasskey(accountId: string, id: string): Promise<void> {
  const { rowCount } = await getPool().query(
    'DELETE FROM webauthn_credentials WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  if (!rowCount) throw new ValidationError('Passkey not found');
}

// ── Registration (authenticated) ──

export async function beginRegistration(account: { id: string; email: string; display_name: string | null }) {
  const { rows: existing } = await getPool().query<{ credential_id: string; transports: string[] }>(
    'SELECT credential_id, transports FROM webauthn_credentials WHERE account_id = $1',
    [account.id],
  );
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(),
    userName: account.email,
    userDisplayName: account.display_name ?? account.email,
    userID: new Uint8Array(Buffer.from(account.id)),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports as never,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  const challengeId = await saveChallenge('register', options.challenge, account.id);
  return { options, challengeId };
}

export async function finishRegistration(
  accountId: string,
  input: { challengeId: string; response: RegistrationResponseJSON; name?: string },
): Promise<{ id: string; name: string | null }> {
  const { challenge, accountId: challengeAccount } = await takeChallenge(input.challengeId, 'register');
  if (challengeAccount !== accountId) throw new UnauthorizedError('Challenge does not belong to this account');

  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigins(),
    expectedRPID: rpID(),
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new ValidationError('Could not verify the passkey');
  }

  const { credential } = verification.registrationInfo;
  const id = newId();
  const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64url');
  const name = input.name?.trim() || defaultPasskeyName(input.response);
  await getPool().query(
    `INSERT INTO webauthn_credentials (id, account_id, credential_id, public_key, counter, transports, name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, accountId, credential.id, publicKeyB64, credential.counter ?? 0, credential.transports ?? [], name],
  );
  return { id, name };
}

function defaultPasskeyName(response: RegistrationResponseJSON): string {
  const t = response.response.transports?.[0];
  if (t === 'internal') return 'This device';
  if (t === 'hybrid') return 'Phone';
  if (t === 'usb' || t === 'nfc') return 'Security key';
  return 'Passkey';
}

// ── Passwordless authentication (no session yet) ──

export async function beginAuthentication() {
  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    userVerification: 'preferred',
    // No allowCredentials → discoverable ("usernameless") sign-in.
  });
  const challengeId = await saveChallenge('authenticate', options.challenge, null);
  return { options, challengeId };
}

/** Verify an assertion and return the owning account id (throws otherwise). */
export async function finishAuthentication(input: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<string> {
  const { challenge } = await takeChallenge(input.challengeId, 'authenticate');

  const { rows } = await getPool().query<CredentialRow>(
    'SELECT * FROM webauthn_credentials WHERE credential_id = $1',
    [input.response.id],
  );
  const cred = rows[0];
  // Use one generic failure message for both "no such credential" and "bad
  // assertion" so the response can't be used to probe which credential ids are
  // registered (no enumeration oracle).
  if (!cred) throw new UnauthorizedError('Passkey sign-in failed');

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigins(),
    expectedRPID: rpID(),
    requireUserVerification: false,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
      counter: Number(cred.counter),
      transports: cred.transports as never,
    },
  });
  if (!verification.verified) throw new UnauthorizedError('Passkey sign-in failed');

  await getPool().query(
    'UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2',
    [verification.authenticationInfo.newCounter, cred.id],
  );
  return cred.account_id;
}
