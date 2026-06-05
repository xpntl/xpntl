-- Up Migration

CREATE TABLE issue_assignees (
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (issue_id, user_id)
);

CREATE INDEX issue_assignees_user_idx ON issue_assignees (user_id);

-- Down Migration

DROP TABLE issue_assignees;
