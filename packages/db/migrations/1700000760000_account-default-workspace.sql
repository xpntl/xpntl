-- Up Migration
-- Per-account default workspace. When set, the sign-in workspace chooser
-- auto-selects this workspace (with an escape hatch to pick another), so
-- multi-workspace users land in their primary space without a manual step.
-- Nullable; cleared automatically if the workspace is deleted.
ALTER TABLE accounts
  ADD COLUMN default_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE accounts DROP COLUMN IF EXISTS default_workspace_id;
