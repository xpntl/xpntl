-- Up Migration

CREATE TABLE checklists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'Checklist',
  position      SMALLINT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX checklists_issue_idx ON checklists (issue_id);

CREATE TABLE checklist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  checked       BOOLEAN NOT NULL DEFAULT false,
  position      SMALLINT NOT NULL DEFAULT 0,
  assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX checklist_items_checklist_idx ON checklist_items (checklist_id);

-- Down Migration

DROP TABLE checklist_items;
DROP TABLE checklists;
