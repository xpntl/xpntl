-- Up Migration

ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE workspaces ADD COLUMN description TEXT;
ALTER TABLE workspaces ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE users DROP COLUMN updated_at;

ALTER TABLE workspaces DROP COLUMN description;
ALTER TABLE workspaces DROP COLUMN disabled_at;
ALTER TABLE workspaces DROP COLUMN updated_at;
