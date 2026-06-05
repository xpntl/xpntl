-- Up Migration
-- Org → Workspace → Project → List hierarchy: the organization becomes the
-- single billable container at the top of the tree, and *every* workspace must
-- be parented by exactly one org. An account OWNS at most one org but may BELONG
-- to many (with a role), so we add org membership with roles.
--
--   * organization_members          — who belongs to an org and at what role
--                                      (Owner / Admin / Member / Viewer)
--   * one org per owner account      — UNIQUE (owner_account_id)
--   * workspaces.organization_id     — backfilled, then NOT NULL (RESTRICT)
--   * subscriptions promoted to org  — billing resolves org-first
--
-- Backfill is non-destructive: it never cancels/merges an active paid
-- subscription. If an account somehow owns multiple orgs that *both* carry an
-- active paid sub, the migration aborts so a human can consolidate by hand.

-- ---------------------------------------------------------------------------
-- 1. Org membership (roles)
-- ---------------------------------------------------------------------------
CREATE TABLE organization_members (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'Member'
                    CHECK (role IN ('Owner', 'Admin', 'Member', 'Viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_id)
);
CREATE INDEX idx_org_members_account ON organization_members (account_id);
CREATE INDEX idx_org_members_org ON organization_members (organization_id);

-- ---------------------------------------------------------------------------
-- 2. Backfill: one org per owner account; re-parent every workspace
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  acct        RECORD;
  ws          RECORD;
  primary_org TEXT;
  new_id      TEXT;
  org_name    TEXT;
  org_slug    TEXT;
  conflicts   INT;
BEGIN
  -- Every account that owns a workspace, or already owns an org, gets exactly
  -- one "primary" org. Its workspaces (and any of its other orgs' workspaces)
  -- are re-parented onto that primary; empty extra orgs are removed.
  FOR acct IN
    SELECT a.id AS account_id, a.display_name, a.email
    FROM accounts a
    WHERE a.id IN (SELECT account_id FROM users WHERE role = 'Owner')
       OR a.id IN (SELECT owner_account_id FROM organizations)
  LOOP
    SELECT id INTO primary_org
    FROM organizations
    WHERE owner_account_id = acct.account_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF primary_org IS NULL THEN
      org_name := COALESCE(
        NULLIF(btrim(acct.display_name), ''),
        (SELECT w.name FROM workspaces w
           JOIN users u ON u.workspace_id = w.id
          WHERE u.account_id = acct.account_id AND u.role = 'Owner'
          ORDER BY w.created_at ASC LIMIT 1),
        NULLIF(split_part(acct.email, '@', 1), ''),
        'Organization');
      new_id   := 'org_' || replace(gen_random_uuid()::text, '-', '');
      org_slug := btrim(regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g'), '-');
      IF org_slug = '' THEN org_slug := 'org'; END IF;
      org_slug := org_slug || '-' || substr(new_id, 5, 6);
      INSERT INTO organizations (id, name, slug, owner_account_id)
        VALUES (new_id, org_name, org_slug, acct.account_id);
      primary_org := new_id;
    END IF;

    -- Re-parent this account's workspaces (org-less, or under another of its
    -- own orgs) onto the primary org.
    UPDATE workspaces w
       SET organization_id = primary_org
     WHERE w.id IN (SELECT workspace_id FROM users
                     WHERE account_id = acct.account_id AND role = 'Owner')
       AND (w.organization_id IS NULL
            OR w.organization_id IN (SELECT id FROM organizations
                                      WHERE owner_account_id = acct.account_id
                                        AND id <> primary_org));

    -- Guard: never silently merge two active PAID subs.
    SELECT count(*) INTO conflicts
    FROM subscriptions s
    JOIN organizations o ON o.id = s.organization_id
    WHERE o.owner_account_id = acct.account_id
      AND o.id <> primary_org
      AND s.status IN ('trialing', 'active', 'past_due')
      AND s.plan_id <> 'free';
    IF conflicts > 0 THEN
      RAISE EXCEPTION
        'Account % owns multiple orgs with active paid subscriptions; consolidate manually before migrating',
        acct.account_id;
    END IF;

    -- Drop the account's now-empty extra orgs (subs.org_id → NULL via FK).
    DELETE FROM organizations
     WHERE owner_account_id = acct.account_id AND id <> primary_org;

    INSERT INTO organization_members (id, organization_id, account_id, role)
      VALUES ('om_' || replace(gen_random_uuid()::text, '-', ''),
              primary_org, acct.account_id, 'Owner')
      ON CONFLICT (organization_id, account_id) DO UPDATE SET role = 'Owner';
  END LOOP;

  -- Defensive sweep: any workspace still org-less (e.g. no Owner row) gets an
  -- org from its earliest member's account.
  FOR ws IN SELECT * FROM workspaces WHERE organization_id IS NULL LOOP
    SELECT account_id INTO acct
    FROM users WHERE workspace_id = ws.id ORDER BY created_at ASC LIMIT 1;

    SELECT id INTO primary_org
    FROM organizations WHERE owner_account_id = acct.account_id
    ORDER BY created_at ASC LIMIT 1;

    IF primary_org IS NULL THEN
      org_name := COALESCE(NULLIF(btrim(ws.name), ''), 'Organization');
      new_id   := 'org_' || replace(gen_random_uuid()::text, '-', '');
      org_slug := btrim(regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g'), '-');
      IF org_slug = '' THEN org_slug := 'org'; END IF;
      org_slug := org_slug || '-' || substr(new_id, 5, 6);
      INSERT INTO organizations (id, name, slug, owner_account_id)
        VALUES (new_id, org_name, org_slug, acct.account_id);
      INSERT INTO organization_members (id, organization_id, account_id, role)
        VALUES ('om_' || replace(gen_random_uuid()::text, '-', ''), new_id, acct.account_id, 'Owner')
        ON CONFLICT (organization_id, account_id) DO UPDATE SET role = 'Owner';
      primary_org := new_id;
    END IF;

    UPDATE workspaces SET organization_id = primary_org WHERE id = ws.id;
  END LOOP;
END $$;

-- Existing workspace collaborators become org Members (the owner stays Owner).
INSERT INTO organization_members (id, organization_id, account_id, role)
SELECT 'om_' || replace(gen_random_uuid()::text, '-', ''),
       w.organization_id, u.account_id, 'Member'
FROM users u
JOIN workspaces w ON w.id = u.workspace_id
WHERE w.organization_id IS NOT NULL
GROUP BY w.organization_id, u.account_id
ON CONFLICT (organization_id, account_id) DO NOTHING;

-- Promote one representative active subscription per org to org-level (prefer a
-- paid plan, then the priciest, then the oldest). Others stay workspace-level
-- and become dormant, since billing resolves org-first.
WITH ranked AS (
  SELECT s.id, w.organization_id,
         ROW_NUMBER() OVER (
           PARTITION BY w.organization_id
           ORDER BY (s.plan_id <> 'free') DESC,
                    COALESCE(p.price_cents, 0) DESC,
                    s.created_at ASC
         ) AS rn
  FROM subscriptions s
  JOIN workspaces w ON w.id = s.workspace_id
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE s.status IN ('trialing', 'active', 'past_due')
    AND s.organization_id IS NULL
)
UPDATE subscriptions s
   SET organization_id = r.organization_id, updated_at = now()
  FROM ranked r
 WHERE s.id = r.id AND r.rn = 1;

-- ---------------------------------------------------------------------------
-- 3. Enforce the invariant
-- ---------------------------------------------------------------------------

-- An org-level subscription spans every workspace in the org, so it is no
-- longer tied to one workspace. (NULLs are distinct in the partial unique
-- index, so "one active sub per workspace" still holds for legacy rows.)
ALTER TABLE subscriptions ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_organization_id_fkey;
ALTER TABLE workspaces ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- An account owns at most one organization.
CREATE UNIQUE INDEX organizations_owner_account_unique ON organizations (owner_account_id);

-- Down Migration

DROP INDEX IF EXISTS organizations_owner_account_unique;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_organization_id_fkey;
ALTER TABLE workspaces ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
DROP TABLE IF EXISTS organization_members;
