-- Up Migration

CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  is_super_admin  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN account_id UUID NOT NULL REFERENCES accounts(id);

CREATE UNIQUE INDEX users_workspace_account_unique
  ON users (workspace_id, account_id);

CREATE INDEX users_account_idx
  ON users (account_id);

CREATE TABLE account_credentials (
  account_id      UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sessions
  ADD COLUMN account_id UUID NOT NULL REFERENCES accounts(id);

CREATE INDEX sessions_account_idx
  ON sessions (account_id)
  WHERE revoked_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS sessions_account_idx;
ALTER TABLE sessions DROP COLUMN account_id;

DROP TABLE IF EXISTS account_credentials;

DROP INDEX IF EXISTS users_account_idx;
DROP INDEX IF EXISTS users_workspace_account_unique;
ALTER TABLE users DROP COLUMN account_id;

DROP TABLE IF EXISTS accounts;
