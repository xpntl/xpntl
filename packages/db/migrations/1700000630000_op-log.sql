-- Up Migration
-- XP-3 Phase 1: real-time sync engine. Every workspace write appends to an
-- append-only op-log with a per-workspace monotonic sequence; the sync gateway
-- fans new ops out to connected clients via Postgres LISTEN/NOTIFY, and clients
-- catch up after a reconnect by reading ops with seq > their last-confirmed seq.

-- Per-workspace monotonic sequence counter. Bumped in the same transaction as
-- the mutation, so seq order == commit order within a workspace.
CREATE TABLE op_seq (
  workspace_id  TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_seq      BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE op_log (
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seq           BIGINT NOT NULL,
  op_id         TEXT NOT NULL,
  actor_id      TEXT,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  mutation      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, seq),
  CONSTRAINT op_log_mutation_check CHECK (mutation IN ('create', 'update', 'delete'))
);

CREATE INDEX op_log_workspace_seq_idx ON op_log (workspace_id, seq);

-- Down Migration

DROP INDEX IF EXISTS op_log_workspace_seq_idx;
DROP TABLE IF EXISTS op_log;
DROP TABLE IF EXISTS op_seq;
