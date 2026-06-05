import type { Server } from 'node:http';
import { getPool } from '@xpntl/db';
import { OP_CHANNEL, type SyncOp, readOpsSince } from '@xpntl/domain';
import { WebSocket, WebSocketServer } from 'ws';
import { consumeSyncTicket } from './tickets.js';

/**
 * Real-time sync gateway (XP-3 Phase 1).
 *
 * Clients connect to ws(s)://<api>/v1/sync?token=<session>&since=<lastSeq>.
 * We authenticate the handshake with the session token, register the socket
 * under its workspace, replay any ops missed since `since`, then stream new ops
 * pushed via a single Postgres LISTEN on the `xpntl_ops` channel.
 *
 * One LISTEN connection serves every workspace; ops are routed in-process by
 * workspaceId. Heartbeat pings drop dead sockets.
 */

type SyncSocket = WebSocket & {
  isAlive?: boolean;
  workspaceId?: string;
  userId?: string;
  /** Issue the socket is currently viewing, for presence (XP-3 Phase 3). */
  presenceIssueId?: string | null;
};

const byWorkspace = new Map<string, Set<SyncSocket>>();

function register(workspaceId: string, ws: SyncSocket): void {
  let set = byWorkspace.get(workspaceId);
  if (!set) {
    set = new Set();
    byWorkspace.set(workspaceId, set);
  }
  set.add(ws);
}

function unregister(workspaceId: string, ws: SyncSocket): void {
  const set = byWorkspace.get(workspaceId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) byWorkspace.delete(workspaceId);
}

/**
 * Build the per-issue viewer map for a workspace (issueId → distinct userIds)
 * and broadcast it to every socket in that workspace. Cheap: workspaces hold a
 * handful of sockets, and we only call this when presence actually changes.
 */
function broadcastPresence(workspaceId: string): void {
  const set = byWorkspace.get(workspaceId);
  if (!set) return;
  const viewers: Record<string, string[]> = {};
  for (const ws of set) {
    if (!ws.presenceIssueId || !ws.userId) continue;
    const list = (viewers[ws.presenceIssueId] ??= []);
    if (!list.includes(ws.userId)) list.push(ws.userId);
  }
  const data = JSON.stringify({ type: 'presence', viewers });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

export function attachSyncGateway(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/v1/sync' });

  wss.on('connection', (rawWs, req) => {
    const ws = rawWs as SyncSocket;
    void (async () => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const ticket = url.searchParams.get('ticket') ?? '';
        const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10) || 0;

        // Auth via a short-lived single-use ticket (minted by POST /v1/sync/ticket)
        // so no long-lived session token ever rides in the WS URL / logs.
        const identity = ticket ? consumeSyncTicket(ticket) : null;
        if (!identity) {
          ws.close(4001, 'unauthorized');
          return;
        }
        const { workspaceId, userId } = identity;

        ws.workspaceId = workspaceId;
        ws.userId = userId;
        ws.presenceIssueId = null;
        ws.isAlive = true;
        register(workspaceId, ws);

        ws.on('pong', () => {
          ws.isAlive = true;
        });

        // Inbound: presence announcements ("I'm viewing issue X" / null).
        ws.on('message', (raw) => {
          let msg: { type?: string; issueId?: string | null };
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (msg.type === 'presence') {
            const next = typeof msg.issueId === 'string' ? msg.issueId : null;
            if (next !== ws.presenceIssueId) {
              ws.presenceIssueId = next;
              broadcastPresence(workspaceId);
            }
          }
        });

        const onGone = () => {
          unregister(workspaceId, ws);
          if (ws.presenceIssueId) broadcastPresence(workspaceId);
        };
        ws.on('close', onGone);
        ws.on('error', onGone);

        // Replay anything the client missed while disconnected. If they're very
        // far behind, readOpsSince caps the batch and the client falls back to a
        // full reload when it sees fewer ops than the gap implies.
        if (since > 0) {
          const missed = await readOpsSince(workspaceId, since);
          for (const op of missed) {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'op', op }));
          }
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ready' }));
        // Hand the newcomer the current viewer map.
        broadcastPresence(workspaceId);
      } catch (err) {
        console.error('[sync] connection setup failed:', err);
        try {
          ws.close(4000, 'error');
        } catch {
          /* already closing */
        }
      }
    })();
  });

  const heartbeat = setInterval(() => {
    for (const set of byWorkspace.values()) {
      for (const ws of set) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          /* socket gone */
        }
      }
    }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  startListener();
  console.log('[xpntl/api]   WS      /v1/sync (real-time)');
}

let listening = false;

/** Single Postgres LISTEN connection that fans NOTIFY ops out to sockets. */
function startListener(): void {
  if (listening) return;
  listening = true;

  void (async () => {
    try {
      const client = await getPool().connect();

      client.on('notification', (msg) => {
        if (msg.channel !== OP_CHANNEL || !msg.payload) return;
        let op: SyncOp;
        try {
          op = JSON.parse(msg.payload) as SyncOp;
        } catch {
          return;
        }
        const set = byWorkspace.get(op.workspaceId);
        if (!set || set.size === 0) return;
        const data = JSON.stringify({ type: 'op', op });
        for (const ws of set) {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
      });

      client.on('error', (err) => {
        console.error('[sync] listener connection error, reconnecting:', err);
        listening = false;
        try {
          client.release(true); // destroy the broken client
        } catch {
          /* noop */
        }
        setTimeout(startListener, 1000);
      });

      await client.query(`LISTEN ${OP_CHANNEL}`);
      console.log('[sync] listening on Postgres channel', OP_CHANNEL);
    } catch (err) {
      console.error('[sync] failed to start listener, retrying:', err);
      listening = false;
      setTimeout(startListener, 2000);
    }
  })();
}
