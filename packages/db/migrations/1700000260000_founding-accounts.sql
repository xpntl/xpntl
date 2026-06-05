-- Up Migration

ALTER TABLE accounts ADD COLUMN is_founding BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX accounts_founding_idx ON accounts (is_founding) WHERE is_founding = true;

-- Down Migration

DROP INDEX IF EXISTS accounts_founding_idx;
ALTER TABLE accounts DROP COLUMN is_founding;
