-- PER-14 — Saved custom views (personal + shared).
-- A view stores a named filter configuration that users can save and share.

CREATE TABLE IF NOT EXISTS saved_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creator_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  filters       jsonb NOT NULL DEFAULT '{}',
  scope         text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'workspace')),
  icon          text,
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_views_workspace
  ON saved_views (workspace_id, scope, position);

CREATE INDEX idx_saved_views_creator
  ON saved_views (workspace_id, creator_id, position);
