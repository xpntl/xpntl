import { oauth } from '@xpntl/domain';
import type { oauth as oauthTypes } from '@xpntl/domain';

type OAuthProfile = oauthTypes.OAuthProfile;
import { type Response, Router } from 'express';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import { SESSION_COOKIE } from '../../middleware/auth.js';

// Apple's published signing keys (rotated by Apple; jose caches + refreshes).
const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// Apple's OAuth client_secret is not a static password — it must be an ES256
// JWT signed with your .p8 private key, valid ≤6 months. We mint it on demand
// from APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY and cache it, so there's
// no manual rotation. If those aren't set we fall back to a static
// APPLE_CLIENT_SECRET (e.g. a hand-minted JWT) for backward compatibility.
let appleSecretCache: { secret: string; expiresAt: number } | null = null;

async function getAppleClientSecret(staticFallback: string): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!teamId || !keyId || !privateKeyRaw || !clientId) {
    return staticFallback;
  }
  const now = Date.now();
  if (appleSecretCache && appleSecretCache.expiresAt - now > 60_000) {
    return appleSecretCache.secret;
  }
  // Env vars often carry the PEM with escaped newlines — normalize them.
  const pem = privateKeyRaw.replace(/\\n/g, '\n');
  const key = await importPKCS8(pem, 'ES256');
  const ttlSeconds = 3600; // short-lived; re-minted from cache as needed
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setAudience(APPLE_ISSUER)
    .setSubject(clientId)
    .sign(key);
  appleSecretCache = { secret, expiresAt: now + ttlSeconds * 1000 };
  return secret;
}

export const oauthRouter: Router = Router();

const PROVIDERS = ['google', 'github', 'microsoft', 'apple'] as const;
type Provider = (typeof PROVIDERS)[number];

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// Native-app SSO callbacks. The app initiates OAuth via /:provider/app and the
// flow runs entirely server-side (the provider only ever sees our registered
// https callback — fully compliant, incl. Google which rejects custom-scheme
// redirects). On success the callback bounces back to the app's custom scheme.
// Strictly allowlisted to prevent the token from being redirected anywhere
// else (open-redirect / token theft).
const APP_REDIRECT_ALLOWLIST = new Set<string>(['xpntl://oauth']);

/** Bounce a finished app-OAuth flow back to the native app's custom scheme. */
function redirectToApp(res: Response, appRedirect: string, params: Record<string, string>) {
  if (!APP_REDIRECT_ALLOWLIST.has(appRedirect)) {
    res.status(400).json({ error: { code: 'oauth_error', message: 'Invalid app redirect' } });
    return;
  }
  const url = new URL(appRedirect);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  res.redirect(url.toString());
}

// ── App-flow integrity (signed state + encrypted ticket) ───
// The app flow is bound end-to-end with app-side PKCE so it can't be CSRF'd:
//  - state is HMAC-signed (callback rejects forged/tampered state)
//  - the session token is never placed in the redirect URL; instead an
//    AES-GCM-encrypted, short-lived ticket bound to the app's PKCE challenge is
//    returned, and the token is only released by /app/exchange to a caller that
//    presents the matching verifier.
const APP_STATE_TTL_MS = 10 * 60 * 1000;
const APP_TICKET_TTL_MS = 3 * 60 * 1000;

function ticketKey(): Buffer {
  // Prefer a dedicated secret; fall back to other always-present prod secrets
  // so the flow works before OAUTH_TICKET_SECRET is set. (Rotating any of these
  // just invalidates in-flight, short-lived states/tickets.)
  const secret =
    process.env.OAUTH_TICKET_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.DATABASE_URL ||
    '';
  if (!secret) throw new Error('No secret available for OAuth ticket signing');
  return crypto.createHash('sha256').update(secret).digest();
}

function signAppState(payload: { r: string; c: string }): string {
  const body = `app.${Buffer.from(
    JSON.stringify({ ...payload, t: Date.now(), n: crypto.randomBytes(8).toString('hex') }),
  ).toString('base64url')}`;
  const sig = crypto.createHmac('sha256', ticketKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAppState(state: string): { r: string; c: string } | null {
  const [prefix, body, sig] = state.split('.');
  if (prefix !== 'app' || !body || !sig) return null;
  const expected = crypto.createHmac('sha256', ticketKey()).update(`app.${body}`).digest('base64url');
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      r?: unknown;
      c?: unknown;
      t?: unknown;
    };
    if (typeof payload.t !== 'number' || Date.now() - payload.t > APP_STATE_TTL_MS) return null;
    if (typeof payload.r !== 'string' || typeof payload.c !== 'string') return null;
    return { r: payload.r, c: payload.c };
  } catch {
    return null;
  }
}

function encryptTicket(token: string, challenge: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ticketKey(), iv);
  const payload = JSON.stringify({ t: token, c: challenge, e: Date.now() + APP_TICKET_TTL_MS });
  const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

function decryptTicket(ticket: string): { t: string; c: string } | null {
  try {
    const raw = Buffer.from(ticket, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ticketKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const obj = JSON.parse(pt) as { t?: unknown; c?: unknown; e?: unknown };
    if (typeof obj.e !== 'number' || Date.now() > obj.e) return null;
    if (typeof obj.t !== 'string' || typeof obj.c !== 'string') return null;
    return { t: obj.t, c: obj.c };
  } catch {
    return null;
  }
}

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string;
};

function getProviderConfig(provider: Provider): ProviderConfig | null {
  switch (provider) {
    case 'google': {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;
      return {
        clientId,
        clientSecret,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scopes: 'openid email profile',
      };
    }
    case 'github': {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;
      return {
        clientId,
        clientSecret,
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        scopes: 'read:user user:email',
      };
    }
    case 'microsoft': {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common';
      if (!clientId || !clientSecret) return null;
      return {
        clientId,
        clientSecret,
        authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
        scopes: 'openid email profile User.Read',
      };
    }
    case 'apple': {
      const clientId = process.env.APPLE_CLIENT_ID;
      // Apple is "configured" if we can produce a client secret — either a
      // static one, or the .p8 minting inputs (team id + key id + private key).
      const canMint = Boolean(
        process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY,
      );
      const clientSecret = process.env.APPLE_CLIENT_SECRET ?? '';
      if (!clientId || (!clientSecret && !canMint)) return null;
      return {
        clientId,
        clientSecret,
        authorizeUrl: 'https://appleid.apple.com/auth/authorize',
        tokenUrl: 'https://appleid.apple.com/auth/token',
        userInfoUrl: '',
        scopes: 'name email',
      };
    }
  }
}

function getCallbackUrl(req: { protocol: string; get: (h: string) => string | undefined }, provider: string): string {
  const base = process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`;
  return `${base}/v1/auth/oauth/${provider}/callback`;
}

type TokenExchangeResult = {
  accessToken: string | undefined;
  tokenData: Record<string, unknown>;
};

async function exchangeCodeForTokens(config: ProviderConfig, code: string, redirectUri: string, codeVerifier?: string): Promise<TokenExchangeResult> {
  // Apple requires a freshly-minted ES256 JWT as the client_secret; everyone
  // else uses the static secret as-is.
  const clientSecret = config.tokenUrl.includes('appleid.apple.com')
    ? await getAppleClientSecret(config.clientSecret)
    : config.clientSecret;
  const params: Record<string, string> = {
    client_id: config.clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  if (codeVerifier) params.code_verifier = codeVerifier;

  const tokenRes = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params),
  });
  const tokenData = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;

  // OAuth token endpoints signal failure via HTTP status and/or an `error`
  // field in the JSON body. Without this check a failed exchange — e.g. Apple
  // returning {"error":"invalid_client"} (bad client secret / wrong Services
  // ID) or {"error":"invalid_grant"} (code reused or expired) — falls through
  // and surfaces downstream as the misleading "missing id_token". Surface the
  // provider's real reason so the cause is visible in the logs and the signin
  // redirect. (No secrets are logged: on failure the body holds only error
  // codes, and params/client_secret are never logged.)
  if (!tokenRes.ok || typeof tokenData.error === 'string') {
    const reason =
      [tokenData.error, tokenData.error_description].filter(Boolean).join(': ') ||
      `HTTP ${tokenRes.status}`;
    console.error(`[oauth] token exchange failed (${new URL(config.tokenUrl).host}):`, reason);
    throw new Error(`OAuth token exchange failed: ${reason}`);
  }

  return { accessToken: tokenData.access_token as string | undefined, tokenData };
}

// ── Provider availability (public, no auth) ───────────────
oauthRouter.get('/providers', (_req, res) => {
  const available = PROVIDERS.filter((p) => getProviderConfig(p) !== null);
  res.json({ providers: available });
});

// ── Initiate OAuth ─────────────────────────────────────────

oauthRouter.get('/:provider', (req, res) => {
  const provider = req.params.provider as string;
  if (!PROVIDERS.includes(provider as Provider)) {
    res.status(400).json({ error: { code: 'invalid_provider', message: `Unknown provider: ${provider}` } });
    return;
  }

  const config = getProviderConfig(provider as Provider);
  if (!config) {
    res.status(501).json({ error: { code: 'provider_not_configured', message: `${provider} SSO is not configured yet. Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET.` } });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');

  // XP-56: Apple returns via response_mode=form_post — a CROSS-SITE POST from
  // apple.com to our callback. A SameSite=Lax cookie is not sent on cross-site
  // POSTs, so the state cookie would be missing → "Invalid or expired OAuth
  // state". For Apple we must use SameSite=None; Secure (Apple requires HTTPS
  // anyway). Other providers use a GET callback, so Lax is fine (and works on
  // localhost http, where None+Secure would be rejected).
  const crossSitePost = provider === 'apple';
  const stateCookieOptions = {
    httpOnly: true,
    sameSite: crossSitePost ? ('none' as const) : ('lax' as const),
    secure: crossSitePost ? true : process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60 * 1000,
  };
  res.cookie('xpntl_oauth_state', state, stateCookieOptions);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getCallbackUrl(req, provider),
    response_type: 'code',
    scope: config.scopes,
    state,
  });

  if (provider === 'apple') {
    params.set('response_mode', 'form_post');
  }

  res.redirect(`${config.authorizeUrl}?${params.toString()}`);
});

// ── Native-app OAuth initiate (server-brokered) ────────────
// The iOS app opens this in ASWebAuthenticationSession. We run the standard web
// OAuth flow (same registered https callback), and the shared callback bounces
// back to the app's custom scheme via the xpntl_oauth_app cookie.

oauthRouter.get('/:provider/app', (req, res) => {
  const provider = req.params.provider as string;
  if (!PROVIDERS.includes(provider as Provider)) {
    res.status(400).json({ error: { code: 'invalid_provider', message: `Unknown provider: ${provider}` } });
    return;
  }
  // Apple uses response_mode=form_post (cross-site POST) — use native Sign in
  // with Apple on iOS instead of this brokered flow.
  if (provider === 'apple') {
    res.status(400).json({ error: { code: 'unsupported_provider', message: 'Use native Sign in with Apple on iOS' } });
    return;
  }

  const config = getProviderConfig(provider as Provider);
  if (!config) {
    res.status(501).json({ error: { code: 'provider_not_configured', message: `${provider} SSO is not configured` } });
    return;
  }

  const appRedirect = String(req.query.redirect_uri ?? '');
  if (!APP_REDIRECT_ALLOWLIST.has(appRedirect)) {
    res.status(400).json({ error: { code: 'invalid_redirect', message: 'redirect_uri is not allowed' } });
    return;
  }

  // App-side PKCE: the app sends base64url(SHA256(verifier)). We bind it into
  // the signed state and (later) the encrypted ticket so the session token is
  // only released to the holder of the verifier.
  const challenge = String(req.query.challenge ?? '');
  if (challenge.length < 16 || challenge.length > 256) {
    res.status(400).json({ error: { code: 'invalid_challenge', message: 'challenge is required' } });
    return;
  }

  // Signed, self-describing state. ASWebAuthenticationSession does not reliably
  // carry our cookies through the cross-site hop to the provider and back
  // (Safari ITP partitions api.xpntl.dev cookies), so the app flow can't depend
  // on a state cookie like the web flow. The HMAC makes it unforgeable.
  const state = signAppState({ r: appRedirect, c: challenge });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getCallbackUrl(req, provider),
    response_type: 'code',
    scope: config.scopes,
    state,
  });
  res.redirect(`${config.authorizeUrl}?${params.toString()}`);
});

// ── Native-app ticket exchange ─────────────────────────────
// The app presents the ticket it received on the custom-scheme callback plus
// the PKCE verifier. We release the session token only if the verifier matches
// the challenge sealed into the ticket — so a leaked/forged ticket is useless
// without the verifier the initiating app holds.
oauthRouter.post('/app/exchange', (req, res) => {
  const { ticket, verifier } = req.body as { ticket?: string; verifier?: string };
  if (!ticket || !verifier) {
    res.status(400).json({ error: { code: 'invalid_request', message: 'ticket and verifier are required' } });
    return;
  }
  const decoded = decryptTicket(ticket);
  if (!decoded) {
    res.status(400).json({ error: { code: 'invalid_ticket', message: 'Invalid or expired ticket' } });
    return;
  }
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const got = Buffer.from(challenge);
  const want = Buffer.from(decoded.c);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    res.status(400).json({ error: { code: 'invalid_verifier', message: 'Verifier does not match' } });
    return;
  }
  res.json({ token: decoded.t });
});

// ── OAuth Callback ─────────────────────────────────────────

oauthRouter.get('/:provider/callback', async (req, res) => {
  const provider = req.params.provider as Provider;
  if (!PROVIDERS.includes(provider)) {
    res.status(400).json({ error: { code: 'invalid_provider', message: `Unknown provider` } });
    return;
  }

  const config = getProviderConfig(provider);
  if (!config) {
    res.status(501).json({ error: { code: 'provider_not_configured', message: `${provider} SSO not configured` } });
    return;
  }

  const { code, state } = req.query as { code?: string; state?: string };
  const savedState = req.cookies?.xpntl_oauth_state;

  // Native-app flow is detected + validated via an HMAC-signed, self-describing
  // state (see /:provider/app), so it doesn't depend on the state cookie (which
  // ASWebAuthenticationSession may drop). The web flow keeps its cookie-based
  // CSRF check unchanged. Provider state is hex, so it can never collide with
  // the "app." prefix.
  const isAppFlow = typeof state === 'string' && state.startsWith('app.');
  const appState = isAppFlow && state ? verifyAppState(state) : null;

  if (!code || !state) {
    res.status(400).json({ error: { code: 'oauth_error', message: 'Invalid or expired OAuth state' } });
    return;
  }
  if (isAppFlow) {
    if (!appState || !APP_REDIRECT_ALLOWLIST.has(appState.r)) {
      res.status(400).json({ error: { code: 'oauth_error', message: 'Invalid or expired OAuth state' } });
      return;
    }
  } else {
    if (state !== savedState) {
      res.status(400).json({ error: { code: 'oauth_error', message: 'Invalid or expired OAuth state' } });
      return;
    }
    res.clearCookie('xpntl_oauth_state', { path: '/' });
  }

  try {
    const { accessToken, tokenData } = await exchangeCodeForTokens(config, code, getCallbackUrl(req, provider));
    if (!accessToken && provider !== 'apple') {
      res.status(400).json({ error: { code: 'oauth_error', message: 'Failed to get access token' } });
      return;
    }

    const profile = await fetchUserProfile(provider, accessToken ?? '', config, {
      idToken: tokenData.id_token as string | undefined,
    });

    const result = await oauth.handleOAuthCallback(profile, {
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip ?? null,
    });

    if (appState) {
      // Never put the session token in the URL — hand back a PKCE-bound,
      // encrypted, short-lived ticket the app exchanges via /app/exchange.
      const ticket = encryptTicket(result.token, appState.c);
      redirectToApp(res, appState.r, { ticket });
      return;
    }
    await handleOAuthResult(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    if (appState) {
      redirectToApp(res, appState.r, { error: msg });
      return;
    }
    const webUrl = process.env.PUBLIC_WEB_URL ?? 'https://app.xpntl.dev';
    res.redirect(`${webUrl}/signin?error=${encodeURIComponent(msg)}`);
  }
});

// ── Apple POST Callback (Apple uses form_post response mode) ──

oauthRouter.post('/:provider/callback', async (req, res) => {
  const provider = req.params.provider as Provider;
  if (!PROVIDERS.includes(provider)) {
    res.status(400).json({ error: { code: 'invalid_provider', message: `Unknown provider` } });
    return;
  }

  const config = getProviderConfig(provider);
  if (!config) {
    res.status(501).json({ error: { code: 'provider_not_configured', message: `${provider} SSO not configured` } });
    return;
  }

  const { code, state, user: userJson } = req.body as { code?: string; state?: string; user?: string };
  const savedState = req.cookies?.xpntl_oauth_state;

  if (!code || !state || state !== savedState) {
    res.status(400).json({ error: { code: 'oauth_error', message: 'Invalid or expired OAuth state' } });
    return;
  }
  res.clearCookie('xpntl_oauth_state', { path: '/' });

  let appleUser: { name?: { firstName?: string; lastName?: string }; email?: string } | undefined;
  if (userJson) {
    try {
      appleUser = JSON.parse(userJson) as typeof appleUser;
    } catch {
      // user field is only sent on first authorization; ignore parse errors
    }
  }

  try {
    const { tokenData } = await exchangeCodeForTokens(config, code, getCallbackUrl(req, provider));

    const profile = await fetchUserProfile(provider, (tokenData.access_token as string) ?? '', config, {
      idToken: tokenData.id_token as string | undefined,
      appleUser,
    });

    const result = await oauth.handleOAuthCallback(profile, {
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip ?? null,
    });

    await handleOAuthResult(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    const webUrl = process.env.PUBLIC_WEB_URL ?? 'https://app.xpntl.dev';
    res.redirect(`${webUrl}/signin?error=${encodeURIComponent(msg)}`);
  }
});

// ── Mobile: provider config (clientId + auth URL + scopes) ───

oauthRouter.get('/:provider/config', (req, res) => {
  const provider = req.params.provider as string;
  if (!PROVIDERS.includes(provider as Provider)) {
    res.status(400).json({ error: { code: 'invalid_provider', message: `Unknown provider: ${provider}` } });
    return;
  }

  const config = getProviderConfig(provider as Provider);
  if (!config) {
    res.status(501).json({ error: { code: 'provider_not_configured', message: `${provider} SSO is not configured` } });
    return;
  }

  res.json({
    clientId: config.clientId,
    authorizationEndpoint: config.authorizeUrl,
    scopes: config.scopes.split(' '),
  });
});

// ── Mobile: exchange authorization code for session token ─────
//
// The mobile app (expo-auth-session) completes the browser-based OAuth
// flow itself, then POSTs the resulting code here. We exchange it for
// tokens, resolve the profile, and return a JSON session — no cookies,
// no redirects.

oauthRouter.post('/:provider/mobile', async (req, res) => {
  const provider = req.params.provider as string;
  if (!PROVIDERS.includes(provider as Provider)) {
    res.status(400).json({ error: { code: 'invalid_provider', message: `Unknown provider: ${provider}` } });
    return;
  }

  const config = getProviderConfig(provider as Provider);
  if (!config) {
    res.status(501).json({ error: { code: 'provider_not_configured', message: `${provider} SSO is not configured` } });
    return;
  }

  const { code, redirectUri, codeVerifier } = req.body as { code?: string; redirectUri?: string; codeVerifier?: string };
  if (!code || !redirectUri) {
    res.status(400).json({ error: { code: 'missing_params', message: 'code and redirectUri are required' } });
    return;
  }

  try {
    const { accessToken, tokenData } = await exchangeCodeForTokens(config, code, redirectUri, codeVerifier);
    if (!accessToken && provider !== 'apple') {
      res.status(400).json({ error: { code: 'oauth_error', message: 'Failed to get access token from provider' } });
      return;
    }

    const profile = await fetchUserProfile(provider as Provider, accessToken ?? '', config, {
      idToken: tokenData.id_token as string | undefined,
    });

    const result = await oauth.handleOAuthCallback(profile, {
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip ?? null,
    });

    if (result.kind === 'session') {
      res.json({
        step: 'session',
        token: result.token,
        user: result.user,
        workspace: result.workspace,
      });
    } else if (result.kind === 'choose') {
      res.json({
        step: 'choose',
        token: result.token,
        memberships: result.memberships,
      });
    } else {
      // onboarding — account exists but has no workspace yet
      res.json({
        step: 'onboarding',
        token: result.token,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth mobile exchange failed';
    res.status(500).json({ error: { code: 'oauth_error', message: msg } });
  }
});

// ── Shared result handler (redirect) ────────

import type { LoginResult } from '@xpntl/domain';

async function handleOAuthResult(
  res: Response,
  result: Exclude<LoginResult, { kind: 'mfa' }>,
) {
  const webUrl = process.env.PUBLIC_WEB_URL ?? 'https://app.xpntl.dev';

  res.cookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);

  if (result.kind === 'onboarding') {
    res.redirect(`${webUrl}/onboarding`);
  } else if (result.kind === 'choose') {
    res.redirect(`${webUrl}/signin?step=choose`);
  } else {
    res.redirect(`${webUrl}/issues`);
  }
}

// ── Provider-specific user profile fetching ────────────────

async function fetchUserProfile(provider: Provider, accessToken: string, config: ProviderConfig, extra?: { idToken?: string; appleUser?: { name?: { firstName?: string; lastName?: string }; email?: string } }): Promise<OAuthProfile> {
  switch (provider) {
    case 'google': {
      const res = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json() as { id: string; email: string; name?: string };
      return { provider: 'google', providerAccountId: data.id, email: data.email, displayName: data.name };
    }
    case 'github': {
      const [userRes, emailRes] = await Promise.all([
        fetch(config.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }),
        fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }),
      ]);
      const user = await userRes.json() as { id: number; login: string; name?: string };
      const emails = await emailRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails[0];
      return { provider: 'github', providerAccountId: String(user.id), email: primary?.email ?? `${user.login}@users.noreply.github.com`, displayName: user.name ?? user.login };
    }
    case 'microsoft': {
      const res = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json() as { id: string; mail?: string; userPrincipalName: string; displayName?: string };
      return { provider: 'microsoft', providerAccountId: data.id, email: data.mail ?? data.userPrincipalName, displayName: data.displayName };
    }
    case 'apple': {
      // Apple returns user info in the id_token JWT, not a userinfo endpoint.
      // The token MUST be cryptographically verified against Apple's JWKS —
      // a base64-decode of the payload trusts attacker-supplied claims and
      // allows account takeover with any forged `sub`/`email`.
      const idToken = extra?.idToken;
      if (!idToken) throw new Error('Apple OAuth: missing id_token');
      let payload: { sub?: string; email?: string };
      try {
        const verified = await jwtVerify(idToken, appleJwks, {
          issuer: APPLE_ISSUER,
          audience: config.clientId,
        });
        payload = verified.payload as { sub?: string; email?: string };
      } catch {
        throw new Error('Apple OAuth: id_token verification failed');
      }
      if (!payload.sub) throw new Error('Apple OAuth: id_token missing sub');
      // Apple sends the user's name only on the first authorization, in the POST body
      const appleUser = extra?.appleUser;
      const displayName = appleUser?.name
        ? [appleUser.name.firstName, appleUser.name.lastName].filter(Boolean).join(' ') || undefined
        : undefined;
      return {
        provider: 'apple',
        providerAccountId: payload.sub,
        email: appleUser?.email ?? payload.email ?? '',
        displayName,
      };
    }
  }
}
