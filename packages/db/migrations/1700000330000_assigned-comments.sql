-- Assigned comments: turn any comment into a trackable action item
ALTER TABLE comments
  ADD COLUMN assignee_id TEXT REFERENCES users(id),
  ADD COLUMN assigned_due_at TIMESTAMPTZ,
  ADD COLUMN assigned_resolved_at TIMESTAMPTZ,
  ADD COLUMN assigned_resolved_by TEXT REFERENCES accounts(id);

CREATE INDEX idx_comments_assignee ON comments (assignee_id) WHERE assignee_id IS NOT NULL;
