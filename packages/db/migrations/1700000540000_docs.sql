CREATE TABLE docs (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_workspace ON docs (workspace_id);
CREATE INDEX idx_docs_project ON docs (workspace_id, project_id);

CREATE TABLE doc_revisions (
  id              TEXT PRIMARY KEY,
  doc_id          TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  edited_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_revisions_doc ON doc_revisions (doc_id);
