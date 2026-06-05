-- Up Migration

ALTER TABLE issues
  ADD COLUMN recurrence_rule TEXT,
  ADD COLUMN recurrence_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN recurrence_next_at TIMESTAMPTZ,
  ADD COLUMN recurrence_source_id UUID REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX issues_recurrence_idx ON issues (recurrence_active, recurrence_next_at)
  WHERE recurrence_active = true AND recurrence_next_at IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS issues_recurrence_idx;

ALTER TABLE issues
  DROP COLUMN recurrence_rule,
  DROP COLUMN recurrence_active,
  DROP COLUMN recurrence_next_at,
  DROP COLUMN recurrence_source_id;
