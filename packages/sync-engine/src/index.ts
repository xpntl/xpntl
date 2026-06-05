/**
 * Op-log sync engine — client (XP-3 Phase 1).
 *
 * Server: every workspace write appends an op-log entry and NOTIFYs the sync
 * gateway, which streams it to connected WebSocket clients.
 *
 * Client (this file): a thin, reconnecting WebSocket client. It tracks the
 * highest server sequence it has seen and replays from there after a reconnect,
 * so a dropped connection catches up without a full reload. Conflict-free
 * optimistic mutations + offline (Phase 2) build on top of this.
 */

export { openKvStore, type KvStore } from './idb.js';
export {
  MutationQueue,
  RetryableError,
  type QueuedMutation,
  type MutationQueueState,
  type MutationQueueOptions,
} from './mutation-queue.js';

export type OpMutation = 'create' | 'update' | 'delete';

export type SyncOp = {
  workspaceId: string;
  seq: number;
  opId: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  mutation: OpMutation;
};

export type SyncStatus = 'connecting' | 'open' | 'closed';

export type SyncClientOptions = {
  /** API origin, http(s) or ws(s) — e.g. "https://api.xpntl.dev" or "ws://localhost:4000". */
  url: string;
  /**
   * Mint a fresh short-lived, single-use handshake ticket. Called before every
   * (re)connect so no long-lived credential ever appears in the WS URL. Return
   * null to abort this attempt (a reconnect will be scheduled).
   */
  getTicket: () => Promise<string | null>;
  /** Called for every op received (live or replayed). */
  onOp: (op: SyncOp) => void;
  /** Optional connection-status callback. */
  onStatus?: (status: SyncStatus) => void;
  /** Presence snapshot: issueId → distinct userIds currently viewing it. */
  onPresence?: (viewers: Record<string, string[]>) => void;
  /** Last confirmed seq to resume from on the first connect (default 0). */
  initialSeq?: number;
};

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;

/** Normalize an http(s)/ws(s) origin into a ws(s)://…/v1/sync base URL. */
function toWsBase(url: string): string {
  let base = url.replace(/\/+$/, '');
  if (base.startsWith('https://')) base = `wss://${base.slice('https://'.length)}`;
  else if (base.startsWith('http://')) base = `ws://${base.slice('http://'.length)}`;
  return `${base}/v1/sync`;
}

export class SyncClient {
  private opts: SyncClientOptions;
  private ws: WebSocket | null = null;
  private lastSeq: number;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private presenceIssueId: string | null = null;

  constructor(opts: SyncClientOptions) {
    this.opts = opts;
    this.lastSeq = opts.initialSeq ?? 0;
  }

  /**
   * Announce which issue the user is currently viewing (or null when not on
   * one). Re-sent automatically after a reconnect.
   */
  setPresence(issueId: string | null): void {
    this.presenceIssueId = issueId;
    this.sendPresence();
  }

  private sendPresence(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'presence', issueId: this.presenceIssueId }));
      } catch {
        /* will re-send on reconnect */
      }
    }
  }

  /** Highest server sequence observed so far. */
  get seq(): number {
    return this.lastSeq;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Detach handlers so the close doesn't schedule a reconnect.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
  }

  private open(): void {
    this.opts.onStatus?.('connecting');
    void (async () => {
      let ticket: string | null;
      try {
        ticket = await this.opts.getTicket();
      } catch {
        ticket = null;
      }
      if (this.stopped) return;
      if (!ticket) {
        this.scheduleReconnect();
        return;
      }
      const base = toWsBase(this.opts.url);
      const qs = `ticket=${encodeURIComponent(ticket)}&since=${this.lastSeq}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${base}?${qs}`);
      } catch {
        this.scheduleReconnect();
        return;
      }
      this.ws = ws;
      this.bind(ws);
    })();
  }

  private bind(ws: WebSocket): void {

    ws.onopen = () => {
      this.attempt = 0;
    };

    ws.onmessage = (event) => {
      let msg: { type: string; op?: SyncOp; viewers?: Record<string, string[]> };
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        this.opts.onStatus?.('open');
        // Re-announce presence after a (re)connect.
        this.sendPresence();
      } else if (msg.type === 'op' && msg.op) {
        if (msg.op.seq > this.lastSeq) this.lastSeq = msg.op.seq;
        this.opts.onOp(msg.op);
      } else if (msg.type === 'presence' && msg.viewers) {
        this.opts.onPresence?.(msg.viewers);
      }
    };

    ws.onclose = () => {
      this.opts.onStatus?.('closed');
      if (!this.stopped) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnect.
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    // Exponential backoff with jitter, capped.
    const expo = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempt);
    const delay = expo / 2 + Math.floor((expo / 2) * Math.random());
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }
}
