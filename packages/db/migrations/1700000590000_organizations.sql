CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_account_id TEXT NOT NULL REFERENCES accounts(id),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspaces ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_workspaces_org ON workspaces (organization_id);
CREATE INDEX idx_organizations_owner ON organizations (owner_account_id);
