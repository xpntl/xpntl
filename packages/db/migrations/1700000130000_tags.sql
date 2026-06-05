-- Up Migration

CREATE TABLE tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#94A3B8',
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tags_workspace_name_unique
  ON tags (workspace_id, lower(name));

CREATE TABLE issue_tags (
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tagged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  tagged_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (issue_id, tag_id)
);

CREATE INDEX issue_tags_tag_idx ON issue_tags (tag_id);

-- Down Migration

DROP TABLE issue_tags;
DROP TABLE tags;
