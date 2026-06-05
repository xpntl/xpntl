import { type PoolClient, getPool } from '@xpntl/db';
import { newId } from '../id.js';

/**
 * Op-log sync engine (XP-3 Phase 1).
 *
 * Every workspace write appends one op-log row inside the *same transaction* as
 * the mutation, then emits a Postgres NOTIFY on the shared `xpntl_ops` channel.
 * Because NOTIFY only fires on COMMIT, a rolled-back mutation produces no op.
 * The sync gateway LISTENs on that one channel and routes each op to the
 * sockets subscribed to its workspace.
 */

export const OP_CHANNEL = 'xpntl_ops';

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

/**
 * Append an op to the log and NOTIFY listeners. MUST be called with the same
 * `client` as the surrounding mutation transaction so the op commits atomically
 * with the data change. Returns the assigned per-workspace sequence number.
 */
export async function writeOp(
  client: PoolClient,
  op: {
    workspaceId: string;
    actorId?: string | null;
    entityType: string;
    entityId: string;
    mutation: OpMutation;
  },
): Promise<number> {
  const seqResult = await client.query<{ last_seq: string }>(
    `INSERT INTO op_seq (workspace_id, last_seq) VALUES ($1, 1)
       ON CONFLICT (workspace_id) DO UPDATE SET last_seq = op_seq.last_seq + 1
       RETURNING last_seq`,
    [op.workspaceId],
  );
  const seq = Number(seqResult.rows[0]!.last_seq);
  const opId = newId();

  await client.query(
    `INSERT INTO op_log (workspace_id, seq, op_id, actor_id, entity_type, entity_id, mutation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [op.workspaceId, seq, opId, op.actorId ?? null, op.entityType, op.entityId, op.mutation],
  );

  const payload: SyncOp = {
    workspaceId: op.workspaceId,
    seq,
    opId,
    actorId: op.actorId ?? null,
    entityType: op.entityType,
    entityId: op.entityId,
    mutation: op.mutation,
  };
  // pg_notify payload is capped at 8000 bytes; we only ship ids + metadata, so
  // we stay well under that and clients fetch the entity body themselves.
  await client.query(`SELECT pg_notify($1, $2)`, [OP_CHANNEL, JSON.stringify(payload)]);

  return seq;
}

/**
 * Catch-up read: ops a reconnecting client missed (seq strictly greater than
 * its last-confirmed seq), oldest first. Capped so a long-disconnected client
 * triggers a full reload instead of streaming thousands of rows.
 */
export async function readOpsSince(
  workspaceId: string,
  sinceSeq: number,
  limit = 500,
): Promise<SyncOp[]> {
  const { rows } = await getPool().query<{
    seq: string;
    op_id: string;
    actor_id: string | null;
    entity_type: string;
    entity_id: string;
    mutation: OpMutation;
  }>(
    `SELECT seq, op_id, actor_id, entity_type, entity_id, mutation
       FROM op_log
      WHERE workspace_id = $1 AND seq > $2
      ORDER BY seq ASC
      LIMIT $3`,
    [workspaceId, sinceSeq, limit],
  );
  return rows.map((r) => ({
    workspaceId,
    seq: Number(r.seq),
    opId: r.op_id,
    actorId: r.actor_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    mutation: r.mutation,
  }));
}

/** Current max seq for a workspace (0 if none) — clients start from here on first connect. */
export async function currentOpSeq(workspaceId: string): Promise<number> {
  const { rows } = await getPool().query<{ last_seq: string }>(
    `SELECT last_seq FROM op_seq WHERE workspace_id = $1`,
    [workspaceId],
  );
  return rows[0] ? Number(rows[0].last_seq) : 0;
}
