CREATE TABLE import_jobs (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  filename        TEXT NOT NULL,
  total_rows      INT NOT NULL DEFAULT 0,
  imported_rows   INT NOT NULL DEFAULT 0,
  failed_rows     INT NOT NULL DEFAULT 0,
  field_mapping   JSONB NOT NULL DEFAULT '{}',
  errors          JSONB NOT NULL DEFAULT '[]',
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_import_jobs_workspace ON import_jobs (workspace_id);
