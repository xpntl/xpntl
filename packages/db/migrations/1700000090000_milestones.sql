-- Up Migration

CREATE TABLE milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  target_date   DATE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX milestones_project_name_unique
  ON milestones (project_id, lower(name));

CREATE INDEX milestones_workspace_idx ON milestones (workspace_id);

ALTER TABLE issues ADD COLUMN milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;
CREATE INDEX issues_milestone_idx ON issues (milestone_id) WHERE milestone_id IS NOT NULL;

-- Down Migration

ALTER TABLE issues DROP COLUMN milestone_id;
DROP TABLE milestones;
