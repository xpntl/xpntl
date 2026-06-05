-- PER-14 — User favorites (issues, projects, views).
-- Each row represents a user's favorite of an entity within a workspace.

CREATE TABLE IF NOT EXISTS favorites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type   text NOT NULL CHECK (entity_type IN ('issue', 'project', 'view')),
  entity_id     uuid NOT NULL,
  position       int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, user_id, entity_type, entity_id)
);

CREATE INDEX idx_favorites_user_workspace
  ON favorites (workspace_id, user_id, entity_type, position);
