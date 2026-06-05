-- Up Migration

CREATE TABLE project_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  color           TEXT NOT NULL DEFAULT '#4EA7FC',
  variables       JSONB NOT NULL DEFAULT '[]'::jsonb,
  blueprint       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX project_templates_workspace_name_unique
  ON project_templates (workspace_id, lower(name));

-- Down Migration

DROP TABLE project_templates;
