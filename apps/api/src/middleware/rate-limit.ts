import type { NextFunction, Request, Response } from 'express';

/**
 * Simple in-memory sliding window rate limiter.
 * Tracks request timestamps per key within a rolling window.
 */
type WindowEntry = {
  timestamps: number[];
};

const windows = new Map<string, WindowEntry>();

// Periodically clean up stale entries (every 60s)
setInterval(() => {
  const cutoff = Date.now() - 120_000; // 2 min stale threshold
  for (const [key, entry] of windows) {
    // Remove timestamps older than cutoff
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}, 60_000);

function checkLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  // Trim old timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    // Find earliest timestamp in window to calculate retry-after
    const earliest = entry.timestamps[0]!;
    const retryAfterMs = earliest + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

const API_KEY_LIMIT = 1000; // per minute, per API key
const AUTH_LIMIT = 5000; // per minute, per signed-in account — generous on purpose
const IP_LIMIT = 100; // per minute, per IP — UNAUTHENTICATED only (brute-force backstop)
const WINDOW_MS = 60_000; // 1 minute

/**
 * Rate limiting middleware for /v1/* routes.
 * - API key:        1000 req/min per key
 * - Signed-in user: 5000 req/min per account — the app legitimately bursts
 *                   (board loads, issue peeks fanning out, polling), so a
 *                   logged-in user should effectively never be limited.
 * - Unauthenticated: 100 req/min per IP — guards login/signup against abuse.
 *
 * Runs after `authenticate`, so req.auth / req.apiKeyScopes are populated.
 */
export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  let key: string;
  let limit: number;

  if (req.apiKeyScopes !== undefined) {
    // API key authenticated — rate limit by the API key (use prefix from bearer token)
    const token = req.get('authorization')?.slice('Bearer '.length) ?? '';
    key = `apikey:${token.slice(0, 16)}`;
    limit = API_KEY_LIMIT;
  } else if (req.auth) {
    // Signed-in session (or harness key) — limit per account, generously.
    key = `account:${req.auth.account.id}`;
    limit = AUTH_LIMIT;
  } else {
    // Unauthenticated — IP-based.
    key = `ip:${req.ip ?? 'unknown'}`;
    limit = IP_LIMIT;
  }

  const result = checkLimit(key, limit, WINDOW_MS);

  // Always set rate limit headers
  const entry = windows.get(key);
  const remaining = Math.max(0, limit - (entry?.timestamps.length ?? 0));
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + WINDOW_MS) / 1000)));

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    res.set('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Please retry after the indicated period.',
      },
    });
    return;
  }

  next();
}

/**
 * Stricter limiter for sensitive credential endpoints (login, signup, MFA,
 * passkey verify). Counts each attempt against BOTH the client IP and an
 * optional per-request identifier (email / MFA ticket), so a single account
 * can't be brute-forced across rotating IPs and a single IP can't spray many
 * accounts. Tighter than the global /v1 limit, and the per-identifier bucket
 * gives MFA tickets a hard attempt cap.
 *
 * In-memory (per replica). A distributed (Redis/Postgres) backing for
 * multi-replica deploys is tracked as a follow-up — see XP-108 #5.
 */
export function sensitiveRateLimit(opts: {
  name: string;
  max: number;
  windowMs?: number;
  identifier?: (req: Request) => string | undefined;
}) {
  const windowMs = opts.windowMs ?? WINDOW_MS;
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? 'unknown';
    const keys = [`auth:${opts.name}:ip:${ip}`];
    const id = opts.identifier?.(req)?.toLowerCase().trim();
    if (id) keys.push(`auth:${opts.name}:id:${id}`);

    for (const key of keys) {
      const result = checkLimit(key, opts.max, windowMs);
      if (!result.allowed) {
        const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        res.status(429).json({
          error: { code: 'rate_limited', message: 'Too many attempts. Please wait and try again.' },
        });
        return;
      }
    }
    next();
  };
}
