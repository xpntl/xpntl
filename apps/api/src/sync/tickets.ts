import { randomBytes } from 'node:crypto';

/**
 * Short-lived, single-use tickets for the WebSocket sync handshake (XP-3).
 *
 * Browsers can't set headers on a WebSocket upgrade, so we can't send the
 * Authorization bearer the way REST does — and putting the long-lived session
 * token in the WS URL would leak it into proxy/access logs and browser history.
 * Instead the client makes a normal authenticated POST /v1/sync/ticket to mint
 * an opaque ticket that expires in seconds and is consumed on first use; only
 * that ephemeral ticket ever appears in a URL.
 *
 * Stored in-process: the ticket route and the gateway run in the same API
 * process, so an in-memory map is sufficient (and tickets are too short-lived
 * to be worth persisting across restarts).
 */

type TicketEntry = { workspaceId: string; userId: string; expiresAt: number };

export type SyncIdentity = { workspaceId: string; userId: string };

const TTL_MS = 30_000;
const tickets = new Map<string, TicketEntry>();

export function issueSyncTicket(workspaceId: string, userId: string): string {
  const ticket = randomBytes(32).toString('base64url');
  tickets.set(ticket, { workspaceId, userId, expiresAt: Date.now() + TTL_MS });
  return ticket;
}

/** Validate and consume a ticket. Returns the identity, or null if invalid/expired/used. */
export function consumeSyncTicket(ticket: string): SyncIdentity | null {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // single-use, regardless of outcome
  if (entry.expiresAt < Date.now()) return null;
  return { workspaceId: entry.workspaceId, userId: entry.userId };
}

// Periodic sweep so expired-but-never-used tickets don't accumulate.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}, 60_000);
sweep.unref?.();
