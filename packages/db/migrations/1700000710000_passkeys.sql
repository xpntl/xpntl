-- Up Migration
-- WebAuthn passkeys (PER-28). Credentials are per-account; challenges are
-- short-lived, single-use, and account_id is NULL for passwordless sign-in
-- (discoverable credentials resolve to an account on verify).

CREATE TABLE webauthn_credentials (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  credential_id  TEXT NOT NULL UNIQUE,           -- base64url
  public_key     TEXT NOT NULL,                  -- base64url(COSE key)
  counter        BIGINT NOT NULL DEFAULT 0,
  transports     TEXT[] NOT NULL DEFAULT '{}',
  name           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at   TIMESTAMPTZ
);
CREATE INDEX webauthn_credentials_account_idx ON webauthn_credentials (account_id);

CREATE TABLE webauthn_challenges (
  id          TEXT PRIMARY KEY,
  account_id  TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  challenge   TEXT NOT NULL,
  kind        TEXT NOT NULL,                      -- 'register' | 'authenticate'
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS webauthn_challenges;
DROP TABLE IF EXISTS webauthn_credentials;
