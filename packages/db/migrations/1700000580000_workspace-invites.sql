-- Pending workspace invites (email not yet accepted)
CREATE TABLE IF NOT EXISTS workspace_invites (
  id            TEXT        PRIMARY KEY,
  workspace_id  TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'Member',
  invited_by    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token         TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_invites_workspace_id_idx ON workspace_invites (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_workspace_email_idx ON workspace_invites (workspace_id, lower(email));
