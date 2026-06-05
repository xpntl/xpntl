CREATE TABLE slack_integrations (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id         TEXT NOT NULL,
  team_name       TEXT,
  channel_id      TEXT NOT NULL,
  channel_name    TEXT,
  webhook_url     TEXT NOT NULL,
  bot_token       TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  notify_issue_created    BOOLEAN NOT NULL DEFAULT true,
  notify_issue_completed  BOOLEAN NOT NULL DEFAULT true,
  notify_comment          BOOLEAN NOT NULL DEFAULT false,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, team_id, channel_id)
);

CREATE INDEX idx_slack_integrations_ws ON slack_integrations (workspace_id);

CREATE TABLE sentry_integrations (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dsn_project     TEXT NOT NULL,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  webhook_secret  TEXT NOT NULL,
  auto_create     BOOLEAN NOT NULL DEFAULT true,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, dsn_project)
);

CREATE INDEX idx_sentry_integrations_ws ON sentry_integrations (workspace_id);
