-- Up Migration

CREATE TABLE custom_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  label         TEXT NOT NULL,
  type          TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  position      INTEGER NOT NULL DEFAULT 0,
  required      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT custom_field_type_check
    CHECK (type IN ('dropdown', 'number', 'url', 'date'))
);

CREATE UNIQUE INDEX custom_fields_workspace_slug_unique
  ON custom_fields (workspace_id, lower(slug));

ALTER TABLE issues ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Down Migration

ALTER TABLE issues DROP COLUMN custom_fields;
DROP TABLE custom_fields;
