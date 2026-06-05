-- Up Migration
-- XP-89 Docs → wiki: docs can nest under a parent doc (folders / sub-pages),
-- with a sibling ordering position.

ALTER TABLE docs ADD COLUMN parent_id TEXT REFERENCES docs(id) ON DELETE SET NULL;
ALTER TABLE docs ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX docs_parent_idx ON docs (workspace_id, parent_id);

-- Down Migration

DROP INDEX IF EXISTS docs_parent_idx;
ALTER TABLE docs DROP COLUMN IF EXISTS position;
ALTER TABLE docs DROP COLUMN IF EXISTS parent_id;
