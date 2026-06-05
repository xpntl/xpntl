-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  key         TEXT NOT NULL UNIQUE,        -- issue prefix, e.g. "ACME" -> ACME-123
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT,
  role            TEXT NOT NULL DEFAULT 'Member',
  is_super_admin  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_role_capitalized CHECK (role IN ('Owner', 'Admin', 'Member', 'Guest'))
);

CREATE UNIQUE INDEX users_workspace_email_unique
  ON users (workspace_id, lower(email));

-- Down Migration

DROP TABLE users;
DROP TABLE workspaces;
