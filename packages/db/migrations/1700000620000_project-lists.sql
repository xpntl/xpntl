-- Up Migration
-- XP-74 Lists within projects — named grouping buckets beneath a project.
-- A list is purely a grouping axis: the board can "group by list" the same way
-- it groups by state/priority/assignee, and an issue belongs to at most one
-- list within its project.

CREATE TABLE project_lists (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#8B8B8B',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_lists_project_idx ON project_lists (workspace_id, project_id);
CREATE UNIQUE INDEX project_lists_project_name_unique ON project_lists (project_id, lower(name));

ALTER TABLE issues ADD COLUMN list_id TEXT REFERENCES project_lists(id) ON DELETE SET NULL;
CREATE INDEX issues_list_idx ON issues (list_id) WHERE list_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS issues_list_idx;
ALTER TABLE issues DROP COLUMN IF EXISTS list_id;
DROP TABLE IF EXISTS project_lists;
