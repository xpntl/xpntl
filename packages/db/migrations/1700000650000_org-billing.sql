-- Up Migration
-- XP-36: consolidated billing at the organization level. A subscription can now
-- belong to an org (parenting multiple workspaces) rather than a single
-- workspace, so a company pays once with seats counted across all its
-- workspaces. workspace_id stays (the originating/owner workspace) for
-- back-compat and the existing per-workspace path.

ALTER TABLE subscriptions ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

-- At most one active subscription per organization.
CREATE UNIQUE INDEX subscriptions_org_active_idx
  ON subscriptions (organization_id)
  WHERE organization_id IS NOT NULL AND status IN ('trialing', 'active', 'past_due');

CREATE INDEX subscriptions_org_idx ON subscriptions (organization_id) WHERE organization_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS subscriptions_org_idx;
DROP INDEX IF EXISTS subscriptions_org_active_idx;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS organization_id;
