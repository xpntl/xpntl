-- Up Migration
-- XP-88 Issue type + blocked flag.
--   type    — one of the built-in catalog keys (issue/task/bug/feature/epic/
--             story/research); identifies the issue with an icon throughout the
--             UI. Defaults to 'issue'.
--   blocked — when true the board card is outlined deep red.

ALTER TABLE issues ADD COLUMN type TEXT NOT NULL DEFAULT 'issue';
ALTER TABLE issues ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX issues_type_idx ON issues (workspace_id, type);
CREATE INDEX issues_blocked_idx ON issues (workspace_id) WHERE blocked;

-- Down Migration

DROP INDEX IF EXISTS issues_blocked_idx;
DROP INDEX IF EXISTS issues_type_idx;
ALTER TABLE issues DROP COLUMN IF EXISTS blocked;
ALTER TABLE issues DROP COLUMN IF EXISTS type;
