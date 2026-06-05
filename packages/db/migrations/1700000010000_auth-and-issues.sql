-- Up Migration

-- Password credentials are split from users so we can later support passwordless
-- users (passkey-only, SSO-only) without putting a NULL password_hash on every row.
CREATE TABLE password_credentials (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque session tokens. Plaintext goes to the client (cookie + Bearer); the DB
-- stores only the sha256 hash so a DB leak does not yield active sessions.
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  user_agent    TEXT,
  ip            INET,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- Workflow states. Six bucketed types, customizable name + position per workspace.
CREATE TABLE workflow_states (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  position      INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_state_type_check
    CHECK (type IN ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'))
);

CREATE UNIQUE INDEX workflow_states_workspace_position_unique
  ON workflow_states (workspace_id, position);

-- Per-workspace monotonic issue counter. Row-level lock on increment.
CREATE TABLE issue_key_counters (
  workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_key      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,           -- e.g. "ACME-123"
  title           TEXT NOT NULL,
  description     TEXT,
  state_id        UUID NOT NULL REFERENCES workflow_states(id),
  priority        INTEGER NOT NULL DEFAULT 0,   -- 0 none, 1 urgent, 2 high, 3 normal, 4 low
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_id       UUID REFERENCES issues(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX issues_workspace_key_unique ON issues (workspace_id, key);
CREATE INDEX issues_workspace_state_idx ON issues (workspace_id, state_id);
CREATE INDEX issues_workspace_assignee_idx ON issues (workspace_id, assignee_id) WHERE assignee_id IS NOT NULL;

-- Append-only audit log. Free on every plan; same code path cloud + self-host.
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,             -- e.g. "workspace.created", "issue.created"
  target_type   TEXT,                       -- e.g. "issue", "user"
  target_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_workspace_created_idx ON audit_log (workspace_id, created_at DESC);
CREATE INDEX audit_log_workspace_actor_idx ON audit_log (workspace_id, actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX audit_log_workspace_event_idx ON audit_log (workspace_id, event_type);

-- Down Migration

DROP TABLE audit_log;
DROP TABLE issues;
DROP TABLE issue_key_counters;
DROP TABLE workflow_states;
DROP TABLE sessions;
DROP TABLE password_credentials;
