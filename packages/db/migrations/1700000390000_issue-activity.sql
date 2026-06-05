-- Issue activity log: structured timeline of changes per issue.
-- Complements the generic audit_log with typed, human-readable entries.

CREATE TABLE IF NOT EXISTS issue_activity (
  id            TEXT PRIMARY KEY,
  issue_id      TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,  -- state_change, assignment_change, priority_change, label_change, description_edit, title_edit, comment_added, comment_resolved, relation_added, relation_removed
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_activity_issue_created
  ON issue_activity (issue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issue_activity_workspace
  ON issue_activity (workspace_id);
