CREATE TABLE IF NOT EXISTS recent_issues (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_key     TEXT NOT NULL,
  issue_title   TEXT NOT NULL,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, issue_key)
);
CREATE INDEX idx_recent_issues_user ON recent_issues(workspace_id, user_id, viewed_at DESC);
