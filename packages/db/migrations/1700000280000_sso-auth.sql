-- Phase 3: SSO-first auth schema
-- Adds account_providers table for multi-provider auth,
-- makes sessions nullable for pre-workspace (onboarding) state.

CREATE TABLE account_providers (
  account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_account_id TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, provider),
  CONSTRAINT provider_check CHECK (provider IN ('password','google','github','microsoft','apple'))
);

CREATE INDEX account_providers_lookup_idx
  ON account_providers (provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- Backfill existing password accounts from account_credentials
INSERT INTO account_providers (account_id, provider)
  SELECT account_id, 'password' FROM account_credentials;

-- Allow pre-workspace sessions (onboarding state)
ALTER TABLE sessions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN workspace_id DROP NOT NULL;
