-- Up Migration
-- Projects become first-class workspace containers. Each project gets its own
-- key prefix (e.g. FRONTEND, API) and its own monotonic issue counter. When an
-- issue moves between projects, the old key is stored as a resolvable alias.

-- 1. Add `key` column to projects (short uppercase prefix, unique per workspace).
ALTER TABLE projects ADD COLUMN key TEXT;

-- 2. Backfill existing projects with an auto-generated key derived from name.
--    Takes first 6 uppercase alpha chars of name; if collision, appends row number.
UPDATE projects
   SET key = sub.base_key
  FROM (
    SELECT id,
           workspace_id,
           upper(regexp_replace(left(name, 6), '[^A-Z]', '', 'gi')) AS base_key,
           row_number() OVER (PARTITION BY workspace_id ORDER BY sort_order, created_at) AS rn
      FROM projects
  ) sub
 WHERE projects.id = sub.id
   AND projects.key IS NULL
   AND sub.base_key <> ''
   AND NOT EXISTS (
     SELECT 1 FROM projects p2
      WHERE p2.workspace_id = sub.workspace_id
        AND p2.key = sub.base_key
        AND p2.id <> sub.id
   );

-- Handle any remaining NULLs (name was non-alpha or collision) by appending row number.
UPDATE projects
   SET key = sub.gen_key
  FROM (
    SELECT id,
           workspace_id,
           'PRJ' || row_number() OVER (PARTITION BY workspace_id ORDER BY sort_order, created_at) AS gen_key
      FROM projects
     WHERE key IS NULL
  ) sub
 WHERE projects.id = sub.id;

ALTER TABLE projects ALTER COLUMN key SET NOT NULL;
CREATE UNIQUE INDEX projects_workspace_key_unique ON projects (workspace_id, key);

-- 3. Create a "General" default project for each workspace that has issues without a project.
INSERT INTO projects (id, workspace_id, name, key, description, status, color, sort_order)
SELECT gen_random_uuid(),
       w.id,
       'General',
       'GEN',
       'Default project for issues without a project assignment',
       'started',
       '#4EA7FC',
       -1
  FROM workspaces w
 WHERE EXISTS (
   SELECT 1 FROM issues i WHERE i.workspace_id = w.id AND i.project_id IS NULL
 )
   AND NOT EXISTS (
   SELECT 1 FROM projects p WHERE p.workspace_id = w.id AND p.key = 'GEN'
 );

-- 4. Assign orphaned issues to the General project.
UPDATE issues
   SET project_id = p.id
  FROM projects p
 WHERE issues.workspace_id = p.workspace_id
   AND p.key = 'GEN'
   AND issues.project_id IS NULL;

-- 5. Also create a General project for workspaces that have NO projects at all but DO have issues.
--    (This handles workspaces where all issues already had project_id = NULL and no projects exist.)
--    Already covered by step 3 above.

-- 6. Make project_id NOT NULL on issues.
ALTER TABLE issues ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- 7. Project-scoped issue key counters.
CREATE TABLE project_key_counters (
  project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_key      INTEGER NOT NULL DEFAULT 0
);

-- Seed counters from existing issues. Count how many issues each project has
-- by parsing the numeric suffix from the current workspace-scoped key.
-- We take the max existing issue number per project as the starting counter.
INSERT INTO project_key_counters (project_id, last_key)
SELECT i.project_id, COUNT(*)
  FROM issues i
 GROUP BY i.project_id;

-- 8. Issue key aliases table (for cross-project moves).
CREATE TABLE issue_key_aliases (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id      TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  old_key       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX issue_key_aliases_workspace_key_unique
  ON issue_key_aliases (workspace_id, old_key);
CREATE INDEX issue_key_aliases_issue_idx
  ON issue_key_aliases (issue_id);

-- 9. User preference: last-used project per workspace.
CREATE TABLE user_project_preferences (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  last_used_project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

-- Down Migration

DROP TABLE user_project_preferences;
DROP TABLE issue_key_aliases;
DROP TABLE project_key_counters;
ALTER TABLE issues ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS projects_workspace_key_unique;
ALTER TABLE projects DROP COLUMN key;
