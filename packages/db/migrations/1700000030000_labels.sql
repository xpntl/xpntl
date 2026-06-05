-- Labels (PER-43): admin-curated, workspace-scoped tags attached to issues.
-- This migration ships labels-only; milestones land separately once projects
-- (PER-40) exist.

CREATE TABLE labels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- OKLch-friendly hex color string (e.g. "#4EA7FC"). The frontend may map
  -- to design tokens; storing raw allows custom hues without a token rebuild.
  color         TEXT NOT NULL DEFAULT '#4EA7FC',
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique on (workspace, name) — case-insensitive via citext-style index.
  UNIQUE (workspace_id, name)
);

CREATE INDEX labels_workspace_idx ON labels(workspace_id);
CREATE INDEX labels_workspace_name_lower_idx ON labels(workspace_id, lower(name));

-- issue_labels — many-to-many join. Cascade-deletes if either side is removed.
CREATE TABLE issue_labels (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id      UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  attached_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  attached_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX issue_labels_label_idx ON issue_labels(label_id);
CREATE INDEX issue_labels_workspace_issue_idx ON issue_labels(workspace_id, issue_id);
