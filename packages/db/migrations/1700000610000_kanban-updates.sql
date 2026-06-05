-- Up Migration
-- XP-57 Kanban updates: rename Todo→Ready, add a Review state, archive flag.

-- 1. Allow the new 'review' state type.
ALTER TABLE workflow_states DROP CONSTRAINT workflow_state_type_check;
ALTER TABLE workflow_states ADD CONSTRAINT workflow_state_type_check
  CHECK (type IN ('triage', 'backlog', 'unstarted', 'started', 'review', 'completed', 'canceled'));

-- 2. Rename the default "Todo" (unstarted) state to "Ready". Only touches the
--    default-named state, leaving any custom-renamed unstarted states alone.
UPDATE workflow_states SET name = 'Ready' WHERE type = 'unstarted' AND name = 'Todo';

-- 3. Insert a "Review" state at position 5 (between In Progress and Done) for
--    every workspace. Offset existing positions >= 5 first so the shift can't
--    transiently collide with the (workspace_id, position) unique index.
UPDATE workflow_states SET position = position + 1000 WHERE position >= 5;
INSERT INTO workflow_states (id, workspace_id, name, type, position)
  SELECT gen_random_uuid()::text, w.id, 'Review', 'review', 5 FROM workspaces w;
UPDATE workflow_states SET position = position - 999 WHERE position >= 1005;

-- 4. Archive flag on issues — archived issues are hidden from the board and the
--    default list, but viewable via the archived view. Mirrors deleted_at.
ALTER TABLE issues ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX issues_archived_idx ON issues (workspace_id, archived_at) WHERE archived_at IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS issues_archived_idx;
ALTER TABLE issues DROP COLUMN IF EXISTS archived_at;

DELETE FROM workflow_states WHERE type = 'review';
-- Close the position gap left by Review (Done 6→5, Canceled 7→6), offset-safe.
UPDATE workflow_states SET position = position + 1000 WHERE position >= 6;
UPDATE workflow_states SET position = position - 1001 WHERE position >= 1006;

UPDATE workflow_states SET name = 'Todo' WHERE type = 'unstarted' AND name = 'Ready';

ALTER TABLE workflow_states DROP CONSTRAINT workflow_state_type_check;
ALTER TABLE workflow_states ADD CONSTRAINT workflow_state_type_check
  CHECK (type IN ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'));
