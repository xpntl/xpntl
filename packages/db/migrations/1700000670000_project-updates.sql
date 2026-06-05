-- Up Migration
-- XP-21 Project updates — timed status posts per project with a health signal
-- (on_track / at_risk / off_track). A lightweight changelog/standup feed.

CREATE TABLE project_updates (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  health        TEXT NOT NULL DEFAULT 'on_track',
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_updates_project_idx ON project_updates (workspace_id, project_id, created_at DESC);

-- Down Migration

DROP INDEX IF EXISTS project_updates_project_idx;
DROP TABLE IF EXISTS project_updates;
