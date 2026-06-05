-- Up Migration

CREATE TABLE initiatives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'planned',
  color         TEXT NOT NULL DEFAULT '#4EA7FC',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT initiative_status_check
    CHECK (status IN ('planned', 'active', 'completed', 'canceled'))
);

CREATE UNIQUE INDEX initiatives_workspace_name_unique
  ON initiatives (workspace_id, lower(name));

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'planned',
  icon            TEXT,
  color           TEXT NOT NULL DEFAULT '#4EA7FC',
  lead_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  initiative_id   UUID REFERENCES initiatives(id) ON DELETE SET NULL,
  start_date      DATE,
  target_date     DATE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_status_check
    CHECK (status IN ('planned', 'started', 'paused', 'completed', 'canceled'))
);

CREATE UNIQUE INDEX projects_workspace_name_unique
  ON projects (workspace_id, lower(name));

CREATE INDEX projects_initiative_idx ON projects (initiative_id) WHERE initiative_id IS NOT NULL;

CREATE TABLE project_teams (
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, team_id)
);

ALTER TABLE issues ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX issues_project_idx ON issues (project_id) WHERE project_id IS NOT NULL;

-- Down Migration

ALTER TABLE issues DROP COLUMN project_id;
DROP TABLE project_teams;
DROP TABLE projects;
DROP TABLE initiatives;
