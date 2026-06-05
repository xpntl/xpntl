-- Up Migration

CREATE TABLE attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  blob_ref      TEXT NOT NULL,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX attachments_issue_idx ON attachments (issue_id);
CREATE INDEX attachments_workspace_idx ON attachments (workspace_id);

-- Down Migration

DROP TABLE attachments;
