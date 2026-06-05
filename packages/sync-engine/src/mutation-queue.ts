import { type KvStore, openKvStore } from './idb.js';

/**
 * Offline mutation queue (XP-3 Phase 2).
 *
 * Edits to existing entities are applied optimistically by the caller, then
 * enqueued here. The queue persists to IndexedDB, sends in FIFO order, and —
 * crucially — survives reload and offline. On reconnect it replays; the server
 * applies last-write-wins, so replay needs no client-side merge.
 *
 * A `send` that throws `RetryableError` (network/offline) keeps the mutation and
 * pauses the queue until the next `flush()`; any other throw is treated as a
 * permanent failure (e.g. validation / 4xx) and drops the mutation.
 */

export type QueuedMutation = {
  /** Client-generated mutation id — stable across retries. */
  id: string;
  /** App-defined discriminator, e.g. "issue.update". */
  kind: string;
  /** Serializable arguments for the sender. */
  args: unknown;
  createdAt: number;
  attempts: number;
};

export class RetryableError extends Error {
  constructor(message = 'retryable') {
    super(message);
    this.name = 'RetryableError';
  }
}

export type MutationQueueState = { pending: number; flushing: boolean };

export type MutationQueueOptions = {
  /** Performs the mutation. Throw RetryableError to keep+pause; any other throw drops it. */
  send: (m: QueuedMutation) => Promise<void>;
  onChange?: (state: MutationQueueState) => void;
  /** Called when a mutation is dropped as a permanent failure. */
  onDrop?: (m: QueuedMutation, err: unknown) => void;
  /** Override the persistence store (defaults to IndexedDB "xpntl-sync"/"mutations"). */
  store?: KvStore;
};

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  }
}

export class MutationQueue {
  private items: QueuedMutation[] = [];
  private flushing = false;
  private opts: MutationQueueOptions;
  private store: KvStore;

  constructor(opts: MutationQueueOptions) {
    this.opts = opts;
    this.store = opts.store ?? openKvStore('xpntl-sync', 'mutations');
  }

  get pending(): number {
    return this.items.length;
  }

  /** Load persisted mutations and attempt a flush. Call once at startup. */
  async init(): Promise<void> {
    const persisted = await this.store.getAll<QueuedMutation>();
    this.items = persisted.sort((a, b) => a.createdAt - b.createdAt);
    this.emit();
    void this.flush();
  }

  async enqueue(kind: string, args: unknown): Promise<string> {
    const m: QueuedMutation = { id: genId(), kind, args, createdAt: Date.now(), attempts: 0 };
    this.items.push(m);
    await this.store.put(m.id, m);
    this.emit();
    void this.flush();
    return m.id;
  }

  /** Send pending mutations in order. Stops at the first retryable failure. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    this.emit();
    try {
      while (this.items.length > 0) {
        const m = this.items[0]!;
        try {
          await this.opts.send(m);
          this.items.shift();
          await this.store.delete(m.id);
          this.emit();
        } catch (err) {
          if (err instanceof RetryableError) {
            m.attempts += 1;
            await this.store.put(m.id, m);
            break; // pause until next flush() trigger
          }
          // Permanent failure — drop so it can't wedge the queue forever.
          this.items.shift();
          await this.store.delete(m.id);
          this.opts.onDrop?.(m, err);
          this.emit();
        }
      }
    } finally {
      this.flushing = false;
      this.emit();
    }
  }

  private emit(): void {
    this.opts.onChange?.({ pending: this.items.length, flushing: this.flushing });
  }
}
