-- Up Migration

CREATE TABLE issue_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  template_title  TEXT,
  template_body   TEXT,
  priority        INTEGER NOT NULL DEFAULT 0,
  state_id        UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  label_ids       UUID[] NOT NULL DEFAULT '{}',
  position        INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX issue_templates_workspace_idx ON issue_templates (workspace_id);
CREATE INDEX issue_templates_team_idx ON issue_templates (team_id) WHERE team_id IS NOT NULL;

-- Down Migration

DROP TABLE issue_templates;
