-- Up Migration

CREATE TABLE issue_relations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  to_issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issue_relation_type_check
    CHECK (type IN ('blocks', 'blocked_by', 'relates_to', 'duplicate_of', 'duplicated_by')),
  CONSTRAINT issue_relation_not_self
    CHECK (from_issue_id != to_issue_id),
  CONSTRAINT issue_relation_unique
    UNIQUE (from_issue_id, to_issue_id, type)
);

CREATE INDEX issue_relations_from_idx ON issue_relations (from_issue_id);
CREATE INDEX issue_relations_to_idx ON issue_relations (to_issue_id);

-- Down Migration

DROP TABLE issue_relations;
