-- Up Migration

CREATE TABLE teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key           TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX teams_workspace_key_unique
  ON teams (workspace_id, upper(key));

CREATE UNIQUE INDEX teams_workspace_name_unique
  ON teams (workspace_id, lower(name));

CREATE TABLE team_members (
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'Member',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_member_role_check CHECK (role IN ('Lead', 'Member'))
);

CREATE INDEX team_members_user_idx ON team_members (user_id);

ALTER TABLE issues ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX issues_team_idx ON issues (team_id) WHERE team_id IS NOT NULL;

-- Down Migration

ALTER TABLE issues DROP COLUMN team_id;
DROP TABLE team_members;
DROP TABLE teams;
