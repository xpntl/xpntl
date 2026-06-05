-- Up Migration
-- TOTP multi-factor auth for email/password accounts.
--   account_mfa                — one row per account once they start enrollment;
--                                enabled_at is NULL until the first code verifies.
--   account_mfa_recovery_codes — single-use hashed recovery codes.
--   mfa_tickets                — short-lived, single-use post-password challenge
--                                tickets. No session is issued until MFA passes,
--                                so a stolen password alone grants nothing.

CREATE TABLE account_mfa (
  account_id   TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  totp_secret  TEXT NOT NULL,
  enabled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_mfa_recovery_codes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_mfa_recovery_account_idx ON account_mfa_recovery_codes (account_id);

CREATE TABLE mfa_tickets (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mfa_tickets_account_idx ON mfa_tickets (account_id);

-- Down Migration

DROP TABLE IF EXISTS mfa_tickets;
DROP TABLE IF EXISTS account_mfa_recovery_codes;
DROP TABLE IF EXISTS account_mfa;
