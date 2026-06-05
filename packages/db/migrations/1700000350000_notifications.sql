-- Notification inbox for users.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,  -- 'mention', 'assigned', 'state_change', 'comment', 'due_soon'
  title TEXT NOT NULL,
  body TEXT,
  issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
  actor_id TEXT REFERENCES users(id),
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, workspace_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
