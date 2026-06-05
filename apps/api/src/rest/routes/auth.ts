import { completeMfaLogin, completePasskeyLogin, createWorkspaceFromOnboarding, listMembershipsForAccount, login, mfa, passkeys, registerAccount, revokeSession, signup, upgradeSession, createSession } from '@xpntl/domain';
import { getPool, withTransaction } from '@xpntl/db';
import { type Response, Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { SESSION_COOKIE, requireAuth } from '../../middleware/auth.js';
import { sensitiveRateLimit } from '../../middleware/rate-limit.js';

export const authRouter: Router = Router();

// Per-route credential throttles (tighter than the global /v1 limit). Each
// attempt counts against the client IP and, where available, a per-request
// identifier (email / MFA ticket) — the latter gives a hard brute-force cap.
const signupLimit = sensitiveRateLimit({
  name: 'signup',
  max: 8,
  identifier: (req) => req.body?.email,
});
const loginLimit = sensitiveRateLimit({
  name: 'login',
  max: 15,
  identifier: (req) => req.body?.email,
});
const mfaLimit = sensitiveRateLimit({
  name: 'verify-mfa',
  max: 10,
  identifier: (req) => req.body?.mfaToken,
});
const passkeyVerifyLimit = sensitiveRateLimit({ name: 'passkey-verify', max: 20 });

const workspaceFields = {
  workspaceName: z.string().min(1, 'Workspace name is required').max(100, 'Workspace name must be 100 characters or fewer'),
  workspaceSlug: z.string().min(3, 'Workspace slug must be at least 3 characters').max(40, 'Workspace slug must be 40 characters or fewer')
    .regex(/^[a-z][a-z0-9-]*$/, 'Workspace slug must start with a lowercase letter and contain only lowercase letters, digits, or hyphens'),
  workspaceKey: z.string().min(2, 'Issue key prefix must be at least 2 characters').max(10, 'Issue key prefix must be 10 characters or fewer')
    .regex(/^[A-Z][A-Z0-9]*$/, 'Issue key prefix must start with an uppercase letter and contain only uppercase letters or digits'),
};

const signupSchema = z.object({
  ...workspaceFields,
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().min(1).max(80).optional(),
});

const loginSchema = z.object({
  workspaceId: z.string().optional(),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().min(1).max(80).optional(),
});

const onboardingSchema = z.object(workspaceFields);

const chooseWorkspaceSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

authRouter.post('/signup', signupLimit, async (req, res) => {
  const input = signupSchema.parse(req.body);

  const result = await signup({
    ...input,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });

  res.cookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
  res.status(201).json({
    workspace: toWorkspaceJson(result.workspace),
    user: toUserJson(result.user),
    token: result.token,
  });
});

// Map a non-MFA login outcome to the wire response (+ set the session cookie).
function sendLoginResult(
  res: Response,
  result: Exclude<Awaited<ReturnType<typeof login>>, { kind: 'mfa' }>,
) {
  if (result.kind === 'choose') {
    res.cookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
    res.status(200).json({
      step: 'choose_workspace',
      token: result.token,
      memberships: result.memberships.map((m) => ({
        workspace: toWorkspaceJson(m.workspace),
        user: toUserJson(m.user),
      })),
    });
    return;
  }
  if (result.kind === 'onboarding') {
    res.cookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
    res.status(200).json({ step: 'onboarding', token: result.token });
    return;
  }
  res.cookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
  res.status(200).json({
    workspace: toWorkspaceJson(result.workspace),
    user: toUserJson(result.user),
    token: result.token,
  });
}

authRouter.post('/login', loginLimit, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await login({
    ...input,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  if (result.kind === 'mfa') {
    // No session yet — the client must clear the second factor first.
    res.status(200).json({ step: 'mfa', mfaToken: result.mfaTicket });
    return;
  }
  sendLoginResult(res, result);
});

const verifyMfaSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1).max(32),
  workspaceId: z.string().optional(),
});

authRouter.post('/verify-mfa', mfaLimit, async (req, res) => {
  const input = verifyMfaSchema.parse(req.body);
  const result = await completeMfaLogin({
    mfaTicket: input.mfaToken,
    code: input.code,
    workspaceId: input.workspaceId,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  sendLoginResult(res, result);
});

// ── MFA management (authenticated) ───────────────────────────────

const mfaCodeSchema = z.object({ code: z.string().min(1).max(32) });

authRouter.get('/mfa', requireAuth, async (req, res) => {
  res.json(await mfa.getMfaStatus(req.auth!.account.id));
});

authRouter.post('/mfa/start', requireAuth, async (req, res) => {
  const enrollment = await mfa.beginTotpEnrollment({
    id: req.auth!.account.id,
    email: req.auth!.account.email,
  });
  res.json(enrollment);
});

authRouter.post('/mfa/confirm', requireAuth, async (req, res) => {
  const { code } = mfaCodeSchema.parse(req.body);
  const result = await mfa.confirmTotpEnrollment(req.auth!.account.id, code);
  res.json(result);
});

authRouter.post('/mfa/recovery-codes', requireAuth, async (req, res) => {
  const { code } = mfaCodeSchema.parse(req.body);
  if (!(await mfa.verifyMfaCode(req.auth!.account.id, code))) {
    res.status(401).json({ error: { code: 'invalid_code', message: 'That code is incorrect' } });
    return;
  }
  res.json({ recoveryCodes: await mfa.regenerateRecoveryCodes(req.auth!.account.id) });
});

authRouter.post('/mfa/disable', requireAuth, async (req, res) => {
  const { code } = mfaCodeSchema.parse(req.body);
  // Require a current second factor to turn MFA off (works for SSO-only accounts too).
  if (!(await mfa.verifyMfaCode(req.auth!.account.id, code))) {
    res.status(401).json({ error: { code: 'invalid_code', message: 'That code is incorrect' } });
    return;
  }
  await mfa.disableMfa(req.auth!.account.id);
  res.status(204).end();
});

// ── Passkeys (WebAuthn) ───────────────────────────────────────────

authRouter.get('/passkeys', requireAuth, async (req, res) => {
  res.json({ passkeys: await passkeys.listPasskeys(req.auth!.account.id) });
});

authRouter.delete('/passkeys/:id', requireAuth, async (req, res) => {
  await passkeys.deletePasskey(req.auth!.account.id, String(req.params.id));
  res.status(204).end();
});

authRouter.post('/passkeys/register/options', requireAuth, async (req, res) => {
  const out = await passkeys.beginRegistration({
    id: req.auth!.account.id,
    email: req.auth!.account.email,
    display_name: req.auth!.account.display_name,
  });
  res.json(out);
});

const passkeyRegisterVerifySchema = z.object({
  challengeId: z.string().min(1),
  response: z.record(z.string(), z.unknown()),
  name: z.string().max(80).optional(),
});

authRouter.post('/passkeys/register/verify', requireAuth, async (req, res) => {
  const input = passkeyRegisterVerifySchema.parse(req.body);
  const result = await passkeys.finishRegistration(req.auth!.account.id, {
    challengeId: input.challengeId,
    // The shape is validated by @simplewebauthn during verification.
    response: input.response as never,
    name: input.name,
  });
  res.status(201).json({ passkey: result });
});

authRouter.post('/passkeys/authenticate/options', async (_req, res) => {
  res.json(await passkeys.beginAuthentication());
});

const passkeyAuthVerifySchema = z.object({
  challengeId: z.string().min(1),
  response: z.record(z.string(), z.unknown()),
  workspaceId: z.string().optional(),
});

authRouter.post('/passkeys/authenticate/verify', passkeyVerifyLimit, async (req, res) => {
  const input = passkeyAuthVerifySchema.parse(req.body);
  const accountId = await passkeys.finishAuthentication({
    challengeId: input.challengeId,
    response: input.response as never,
  });
  const result = await completePasskeyLogin({
    accountId,
    workspaceId: input.workspaceId,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  sendLoginResult(res, result);
});

authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);

  const result = await registerAccount({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });

  res.cookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
  res.status(201).json({
    account: { id: result.account.id, email: result.account.email },
    token: result.token,
  });
});

authRouter.post('/onboarding', requireAuth, async (req, res) => {
  const input = onboardingSchema.parse(req.body);
  const auth = req.auth!;

  const result = await createWorkspaceFromOnboarding({
    accountId: auth.account.id,
    sessionId: auth.session.id,
    workspaceName: input.workspaceName,
    workspaceSlug: input.workspaceSlug,
    workspaceKey: input.workspaceKey,
    displayName: auth.account.display_name,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });

  res.status(201).json({
    workspace: toWorkspaceJson(result.workspace),
    user: toUserJson(result.user),
  });
});

authRouter.post('/choose-workspace', requireAuth, async (req, res) => {
  const { workspaceId } = chooseWorkspaceSchema.parse(req.body);
  const auth = req.auth!;

  const memberships = await listMembershipsForAccount(auth.account.id);
  const match = memberships.find((m) => m.workspace.id === workspaceId);
  if (!match) {
    res.status(403).json({ error: { code: 'forbidden', message: 'Not a member of this workspace' } });
    return;
  }

  await withTransaction(async (client) => {
    await upgradeSession(client, auth.session.id, match.user.id, workspaceId);
  });

  res.status(200).json({
    workspace: toWorkspaceJson(match.workspace),
    user: toUserJson(match.user),
  });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await revokeSession(req.auth!.session.id);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

// Session probe — intentionally NOT behind requireAuth. An unauthenticated
// caller gets 200 { authenticated: false } rather than 401, so the client's
// "am I logged in?" bootstrap doesn't surface a red console error on every
// signed-out page load. (The global `authenticate` middleware still populates
// req.auth from the cookie/token when a valid session exists.)
authRouter.get('/me', async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.json({ authenticated: false, account: null, workspace: null, user: null, hasPassword: false, providers: [] });
    return;
  }

  const { rows: providerRows } = await getPool().query<{ provider: string }>(
    'SELECT provider FROM account_providers WHERE account_id = $1',
    [auth.account.id],
  );
  const providers = providerRows.map((r) => r.provider);
  const hasPassword = providers.includes('password');

  if (!auth.workspace || !auth.user) {
    res.json({
      authenticated: true,
      account: { id: auth.account.id, email: auth.account.email },
      workspace: null,
      user: null,
      hasPassword,
      providers,
    });
    return;
  }
  res.json({
    authenticated: true,
    workspace: toWorkspaceJson(auth.workspace),
    user: toUserJson(auth.user),
    hasPassword,
    providers,
  });
});

// ── Device Authorization Flow (CLI login) ─────────────────

type DeviceCode = {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  token: string | null;
  interval: number;
};

const deviceCodes = new Map<string, DeviceCode>();

function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i]! % chars.length];
    if (i === 3) code += '-';
  }
  return code;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of deviceCodes) {
    if (entry.expiresAt < now) deviceCodes.delete(key);
  }
}, 60_000);

authRouter.post('/device/code', (_req, res) => {
  const deviceCode = crypto.randomBytes(32).toString('base64url');
  const userCode = generateUserCode();

  const entry: DeviceCode = {
    deviceCode,
    userCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    token: null,
    interval: 5,
  };

  deviceCodes.set(deviceCode, entry);

  const webUrl = process.env.PUBLIC_WEB_URL ?? 'https://app.xpntl.dev';
  res.json({
    deviceCode,
    userCode,
    verificationUri: `${webUrl}/device`,
    expiresIn: 600,
    interval: 5,
  });
});

authRouter.post('/device/token', (req, res) => {
  const { deviceCode } = req.body as { deviceCode?: string };
  if (!deviceCode) {
    res.status(400).json({ error: 'missing_device_code' });
    return;
  }

  const entry = deviceCodes.get(deviceCode);
  if (!entry) {
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  if (entry.expiresAt < Date.now()) {
    deviceCodes.delete(deviceCode);
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  if (!entry.token) {
    res.status(400).json({ error: 'authorization_pending' });
    return;
  }

  deviceCodes.delete(deviceCode);
  res.json({ token: entry.token });
});

authRouter.post('/device/approve', requireAuth, async (req, res) => {
  const { userCode } = req.body as { userCode?: string };
  if (!userCode) {
    res.status(400).json({ error: { code: 'bad_request', message: 'User code is required' } });
    return;
  }

  const normalized = userCode.replace(/[-\s]/g, '').toUpperCase();
  let found: DeviceCode | undefined;
  for (const entry of deviceCodes.values()) {
    if (entry.userCode.replace(/-/g, '') === normalized && entry.expiresAt > Date.now()) {
      found = entry;
      break;
    }
  }

  if (!found) {
    res.status(400).json({ error: { code: 'invalid_code', message: 'Invalid or expired code' } });
    return;
  }

  const auth = req.auth!;
  const { token } = await withTransaction(async (client) => {
    return createSession({
      client,
      accountId: auth.account.id,
      userId: auth.user?.id ?? null,
      workspaceId: auth.workspace?.id ?? null,
      userAgent: 'xpntl-cli',
      ip: req.ip ?? null,
    });
  });

  found.token = token;
  res.json({ ok: true });
});

function toWorkspaceJson(w: { id: string; slug: string; name: string; key: string; avatar_url?: string | null }) {
  return { id: w.id, slug: w.slug, name: w.name, key: w.key, avatarUrl: w.avatar_url ?? null };
}

function toUserJson(u: {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url?: string | null;
  role: string;
  is_super_admin: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    avatarUrl: u.avatar_url ?? null,
    role: u.role,
    isSuperAdmin: u.is_super_admin,
  };
}
