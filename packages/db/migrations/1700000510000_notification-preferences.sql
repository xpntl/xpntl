CREATE TABLE notification_preferences (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mention         BOOLEAN NOT NULL DEFAULT true,
  assigned        BOOLEAN NOT NULL DEFAULT true,
  state_change    BOOLEAN NOT NULL DEFAULT true,
  comment         BOOLEAN NOT NULL DEFAULT true,
  due_soon        BOOLEAN NOT NULL DEFAULT true,
  email_digest    TEXT NOT NULL DEFAULT 'none' CHECK (email_digest IN ('none', 'daily', 'weekly')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences (user_id, workspace_id);
