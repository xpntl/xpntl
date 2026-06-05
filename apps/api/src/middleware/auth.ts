import { UnauthorizedError, ForbiddenError, findSessionByToken, touchSession, touchUserSeen, harnessKeys, apiKeys } from '@xpntl/domain';
import type { AuthContext, FullAuthContext } from '@xpntl/domain';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'xpntl_session';
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const recentlyTouched = new Map<string, number>();

// Presence (XP-11): stamp last-active for humans + agents on any authenticated
// request, throttled in-process so it's at most one write per user per minute.
const SEEN_INTERVAL_MS = 60 * 1000;
const recentlySeen = new Map<string, number>();
function maybeTouchSeen(auth: AuthContext | undefined): void {
  const userId = auth?.user?.id;
  const workspaceId = auth?.workspace?.id;
  if (!userId || !workspaceId) return;
  const now = Date.now();
  if (now - (recentlySeen.get(userId) ?? 0) < SEEN_INTERVAL_MS) return;
  recentlySeen.set(userId, now);
  touchUserSeen(workspaceId, userId).catch(() => {});
}

function extractToken(req: Request): string | null {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || null;
  }
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  // API key authentication
  if (token.startsWith('xp_live_')) {
    const result = await apiKeys.resolveApiKeyContext(token);
    if (result) {
      req.auth = result.auth;
      req.apiKeyScopes = result.scopes;
      maybeTouchSeen(req.auth);
    }
    next();
    return;
  }

  if (token.startsWith('xpntl_hk_')) {
    const ctx = await harnessKeys.resolveHarnessKeyContext(token);
    if (ctx) {
      req.auth = ctx;
      maybeTouchSeen(req.auth);
    }
    next();
    return;
  }

  const found = await findSessionByToken(token);
  if (found) {
    req.auth = found;
    const sid = found.session.id;
    const now = Date.now();
    const last = recentlyTouched.get(sid) ?? 0;
    if (now - last > TOUCH_INTERVAL_MS) {
      recentlyTouched.set(sid, now);
      touchSession(sid).catch(() => {});
    }
    maybeTouchSeen(req.auth);
  }
  next();
}

/** Fail with 401 if no auth context is attached (partial or full). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new UnauthorizedError('Sign in to continue'));
    return;
  }
  next();
}

/** Fail with 401 if auth context is missing or partial (no workspace). */
export function requireFullAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth || !req.auth.workspace) {
    next(new UnauthorizedError('Sign in to continue'));
    return;
  }
  next();
}

/** Narrows req.auth to FullAuthContext. Safe after requireFullAuth middleware. */
export function getAuth(req: Request): FullAuthContext {
  return req.auth as FullAuthContext;
}

/**
 * Require the request to have a specific API key scope.
 * Session-based auth (no apiKeyScopes) is always allowed — scopes only
 * restrict API key access.
 */
export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Session-based auth is not scope-restricted
    if (!req.apiKeyScopes) {
      next();
      return;
    }
    if (!req.apiKeyScopes.includes(scope)) {
      next(new ForbiddenError(`API key missing required scope: ${scope}`));
      return;
    }
    next();
  };
}

export const SESSION_COOKIE = COOKIE_NAME;
