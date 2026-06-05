-- Up Migration
-- Project delete was blocked: the project-scoped-keys migration set
-- issues.project_id to ON DELETE RESTRICT, so deleting a project with any issue
-- failed with a foreign-key error. Deleting a project is an explicit,
-- type-to-confirm destructive action that should remove the project and its
-- issues (which in turn cascade to comments/reactions/etc). Switch to CASCADE.

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
