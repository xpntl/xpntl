-- Up Migration

CREATE TABLE plans (
  id              TEXT PRIMARY KEY,            -- 'free', 'pro', 'enterprise'
  name            TEXT NOT NULL,
  price_cents     INTEGER NOT NULL DEFAULT 0,  -- per user per month
  max_users       INTEGER,                     -- NULL = unlimited
  max_projects    INTEGER,                     -- NULL = unlimited
  max_harness_keys INTEGER NOT NULL DEFAULT 1,
  features        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name, price_cents, max_users, max_projects, max_harness_keys, features)
VALUES
  ('free',       'Free',       0,    1,    3,  1, '{"mcp": true, "sso": true}'),
  ('pro',        'Pro',        600,  NULL, NULL, 2147483647, '{"mcp": true, "sso": true, "priority_support": true}'),
  ('enterprise', 'Enterprise', 1500, NULL, NULL, 2147483647, '{"mcp": true, "sso": true, "priority_support": true, "sla": true, "audit_log_export": true}');

CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id             TEXT NOT NULL REFERENCES plans(id),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id  TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscriptions_workspace_active_idx
  ON subscriptions (workspace_id)
  WHERE status IN ('trialing', 'active', 'past_due');

CREATE INDEX subscriptions_stripe_customer_idx
  ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE license_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash        TEXT NOT NULL UNIQUE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES plans(id),
  issued_by       UUID REFERENCES accounts(id),
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  last_validated   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX license_keys_workspace_idx ON license_keys (workspace_id);

CREATE TABLE coding_harness_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Default',
  key_prefix      TEXT NOT NULL,              -- first 8 chars for identification
  key_hash        TEXT NOT NULL UNIQUE,
  created_by      UUID REFERENCES accounts(id),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coding_harness_keys_workspace_idx
  ON coding_harness_keys (workspace_id)
  WHERE revoked_at IS NULL;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE workspaces
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS updated_at;

DROP TABLE IF EXISTS coding_harness_keys;
DROP TABLE IF EXISTS license_keys;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plans;
