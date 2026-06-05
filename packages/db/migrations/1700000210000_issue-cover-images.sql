-- Up Migration

ALTER TABLE issues
  ADD COLUMN cover_blob_ref TEXT,
  ADD COLUMN cover_position REAL NOT NULL DEFAULT 50;

-- Down Migration

ALTER TABLE issues
  DROP COLUMN cover_blob_ref,
  DROP COLUMN cover_position;
