-- Up Migration

ALTER TABLE issues ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX issues_deleted_idx ON issues (workspace_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- Down Migration

DROP INDEX issues_deleted_idx;
ALTER TABLE issues DROP COLUMN deleted_at;
