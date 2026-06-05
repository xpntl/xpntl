-- Up Migration

CREATE TABLE waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'website',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_at  TIMESTAMPTZ,
  CONSTRAINT waitlist_email_unique UNIQUE (email)
);

CREATE INDEX waitlist_invited_at_idx ON waitlist (invited_at) WHERE invited_at IS NULL;

CREATE TABLE invite_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  email        TEXT,
  max_uses     INT NOT NULL DEFAULT 1,
  use_count    INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES accounts(id),
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invite_codes_available CHECK (use_count <= max_uses)
);

CREATE INDEX invite_codes_code_idx ON invite_codes (code);

CREATE TABLE invite_code_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id  UUID NOT NULL REFERENCES invite_codes(id),
  account_id      UUID NOT NULL REFERENCES accounts(id),
  redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT redemptions_unique UNIQUE (invite_code_id, account_id)
);

-- Down Migration

DROP TABLE IF EXISTS invite_code_redemptions;
DROP TABLE IF EXISTS invite_codes;
DROP TABLE IF EXISTS waitlist;
