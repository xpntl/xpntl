-- Up Migration

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE sessions DROP COLUMN IF EXISTS last_active_at;
