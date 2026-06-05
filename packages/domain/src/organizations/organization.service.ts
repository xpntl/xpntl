import { type PoolClient, getPool } from '@xpntl/db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  owner_account_id: string;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Org-level role. Governs org concerns only (billing, membership, workspace
 *  lifecycle) — it does NOT grant access to a workspace's data; that still
 *  requires explicit workspace membership (orthogonal model, v1). */
export type OrgRole = 'Owner' | 'Admin' | 'Member' | 'Viewer';

export type OrgMemberRow = {
  id: string;
  organization_id: string;
  account_id: string;
  role: OrgRole;
  created_at: Date;
  updated_at: Date;
};

export type OrgMemberView = {
  accountId: string;
  email: string;
  displayName: string | null;
  role: OrgRole;
  isOwner: boolean;
  joinedAt: Date;
};

const ROLE_RANK: Record<OrgRole, number> = { Viewer: 0, Member: 1, Admin: 2, Owner: 3 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function orgSlug(name: string, id: string): string {
  const base = slugify(name) || 'org';
  return `${base}-${id.slice(-6).toLowerCase()}`;
}

/** The caller's role in an org, or null if they don't belong to it. */
export async function getOrgRole(orgId: string, accountId: string): Promise<OrgRole | null> {
  const { rows } = await getPool().query<{ role: OrgRole }>(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND account_id = $2',
    [orgId, accountId],
  );
  return rows[0]?.role ?? null;
}

/** Assert the caller has at least `min` role in the org; returns the org. */
export async function assertOrgRole(
  ctx: FullAuthContext,
  orgId: string,
  min: OrgRole,
): Promise<OrganizationRow> {
  const { rows } = await getPool().query<OrganizationRow>(
    'SELECT * FROM organizations WHERE id = $1',
    [orgId],
  );
  const org = rows[0];
  if (!org) throw new NotFoundError(`Organization ${orgId} not found`);

  const role = await getOrgRole(orgId, ctx.account.id);
  if (!role || ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new ForbiddenError(`Requires organization ${min} role`);
  }
  return org;
}

// ---------------------------------------------------------------------------
// One org per account (the invariant)
// ---------------------------------------------------------------------------

/** The org owned by an account, or null. An account owns at most one org. */
export async function getAccountOrg(accountId: string): Promise<OrganizationRow | null> {
  const { rows } = await getPool().query<OrganizationRow>(
    'SELECT * FROM organizations WHERE owner_account_id = $1 ORDER BY created_at ASC LIMIT 1',
    [accountId],
  );
  return rows[0] ?? null;
}

/**
 * Get-or-create the account's org inside an existing transaction. This is how
 * the "every workspace is parented by an org" invariant is realized at the
 * source: workspace creation (signup + the authenticated path) calls this and
 * links the new workspace to the returned org. Creates the Owner membership and
 * a free org-level subscription on first creation.
 */
export async function getOrCreateAccountOrgTx(
  client: PoolClient,
  accountId: string,
  opts: { nameHint?: string | null } = {},
): Promise<OrganizationRow> {
  const existing = await client.query<OrganizationRow>(
    'SELECT * FROM organizations WHERE owner_account_id = $1 ORDER BY created_at ASC LIMIT 1',
    [accountId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const id = newId();
  const name = (opts.nameHint ?? '').trim() || 'Organization';
  const { rows } = await client.query<OrganizationRow>(
    `INSERT INTO organizations (id, name, slug, owner_account_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, name, orgSlug(name, id), accountId],
  );
  const org = rows[0]!;

  await client.query(
    `INSERT INTO organization_members (id, organization_id, account_id, role)
     VALUES ($1, $2, $3, 'Owner')
     ON CONFLICT (organization_id, account_id) DO NOTHING`,
    [newId(), org.id, accountId],
  );
  await client.query(
    `INSERT INTO subscriptions (id, organization_id, workspace_id, plan_id, status)
     SELECT $1, $2, NULL, 'free', 'active'
     WHERE NOT EXISTS (
       SELECT 1 FROM subscriptions
        WHERE organization_id = $2 AND status IN ('trialing', 'active', 'past_due'))`,
    [newId(), org.id],
  );
  return org;
}

/** Link a workspace to an org within a transaction (used at creation time). */
export async function linkWorkspaceToOrgTx(
  client: PoolClient,
  workspaceId: string,
  orgId: string,
): Promise<void> {
  await client.query('UPDATE workspaces SET organization_id = $1 WHERE id = $2', [
    orgId,
    workspaceId,
  ]);
  // Reflect the workspace's members into org membership (owner stays owner).
  await client.query(
    `INSERT INTO organization_members (id, organization_id, account_id, role)
     SELECT $1, $2, u.account_id, 'Member' FROM users u
      WHERE u.workspace_id = $3 AND u.is_agent = false
     ON CONFLICT (organization_id, account_id) DO NOTHING`,
    [newId(), orgId, workspaceId],
  );
}

// ---------------------------------------------------------------------------
// CRUD (internal — there is no user-facing "create organization"; every
// account gets exactly one org, created with its first workspace)
// ---------------------------------------------------------------------------

export async function createOrganization(
  ctx: FullAuthContext,
  input: { name: string; slug?: string },
): Promise<OrganizationRow> {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Organization name is required');

  const owned = await getAccountOrg(ctx.account.id);
  if (owned) throw new ConflictError('You already own an organization');

  const id = newId();
  const slug = (input.slug ?? slugify(name)) || orgSlug(name, id);
  const org = await getPool()
    .query<OrganizationRow>(
      `INSERT INTO organizations (id, name, slug, owner_account_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, name, slug, ctx.account.id],
    )
    .then((r) => r.rows[0]!)
    .catch((err: Error & { code?: string }) => {
      if (err.code === '23505') throw new ConflictError('Organization slug already in use');
      throw err;
    });

  await getPool().query(
    `INSERT INTO organization_members (id, organization_id, account_id, role)
     VALUES ($1, $2, $3, 'Owner') ON CONFLICT DO NOTHING`,
    [newId(), org.id, ctx.account.id],
  );
  return org;
}

export async function getOrganization(
  ctx: FullAuthContext,
  orgId: string,
): Promise<OrganizationRow> {
  return assertOrgRole(ctx, orgId, 'Viewer');
}

/** Orgs the account belongs to (owns or is a member of). */
export async function listOrganizations(accountId: string): Promise<OrganizationRow[]> {
  const { rows } = await getPool().query<OrganizationRow>(
    `SELECT o.* FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
      WHERE m.account_id = $1
      ORDER BY (o.owner_account_id = $1) DESC, o.created_at DESC`,
    [accountId],
  );
  return rows;
}

export async function updateOrganization(
  ctx: FullAuthContext,
  orgId: string,
  input: { name?: string; slug?: string },
): Promise<OrganizationRow> {
  await assertOrgRole(ctx, orgId, 'Admin');

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Organization name cannot be empty');
    fields.push(`name = $${idx++}`);
    values.push(name);
  }
  if (input.slug !== undefined) {
    const slug = input.slug.trim();
    if (!slug) throw new ValidationError('Organization slug cannot be empty');
    fields.push(`slug = $${idx++}`);
    values.push(slug);
  }
  if (fields.length === 0) throw new ValidationError('No fields to update');

  fields.push(`updated_at = now()`);
  values.push(orgId);

  const { rows } = await getPool().query<OrganizationRow>(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0]!;
}

export async function deleteOrganization(ctx: FullAuthContext, orgId: string): Promise<void> {
  await assertOrgRole(ctx, orgId, 'Owner');
  // organization_id is NOT NULL on workspaces (RESTRICT), so an org with any
  // workspace cannot be deleted — that's intentional (orgs are permanent
  // containers once they hold workspaces).
  await getPool()
    .query('DELETE FROM organizations WHERE id = $1', [orgId])
    .catch((err: Error & { code?: string }) => {
      if (err.code === '23503') {
        throw new ValidationError('Cannot delete an organization that still has workspaces');
      }
      throw err;
    });
}

// ---------------------------------------------------------------------------
// Membership (Owner / Admin / Member / Viewer)
// ---------------------------------------------------------------------------

export async function listOrgMembers(
  ctx: FullAuthContext,
  orgId: string,
): Promise<OrgMemberView[]> {
  const org = await assertOrgRole(ctx, orgId, 'Viewer');
  const { rows } = await getPool().query<{
    account_id: string;
    email: string;
    display_name: string | null;
    role: OrgRole;
    created_at: Date;
  }>(
    `SELECT m.account_id, a.email, a.display_name, m.role, m.created_at
       FROM organization_members m
       JOIN accounts a ON a.id = m.account_id
      WHERE m.organization_id = $1
      ORDER BY (m.role = 'Owner') DESC, a.email ASC`,
    [orgId],
  );
  return rows.map((r) => ({
    accountId: r.account_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    isOwner: r.account_id === org.owner_account_id,
    joinedAt: r.created_at,
  }));
}

/** Add an existing account (by email) to the org with a non-Owner role. */
export async function addOrgMember(
  ctx: FullAuthContext,
  orgId: string,
  input: { email: string; role: Exclude<OrgRole, 'Owner'> },
): Promise<OrgMemberView> {
  await assertOrgRole(ctx, orgId, 'Admin');
  const email = input.email.trim().toLowerCase();
  if (!email) throw new ValidationError('Email is required');

  const { rows: acct } = await getPool().query<{
    id: string;
    email: string;
    display_name: string | null;
  }>('SELECT id, email, display_name FROM accounts WHERE lower(email) = $1', [email]);
  if (!acct[0]) throw new NotFoundError(`No account found for ${email}`);

  const id = newId();
  const { rows } = await getPool().query<{ created_at: Date; role: OrgRole }>(
    `INSERT INTO organization_members (id, organization_id, account_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, account_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()
     RETURNING created_at, role`,
    [id, orgId, acct[0].id, input.role],
  );
  return {
    accountId: acct[0].id,
    email: acct[0].email,
    displayName: acct[0].display_name,
    role: rows[0]!.role,
    isOwner: false,
    joinedAt: rows[0]!.created_at,
  };
}

export async function updateOrgMemberRole(
  ctx: FullAuthContext,
  orgId: string,
  accountId: string,
  role: Exclude<OrgRole, 'Owner'>,
): Promise<void> {
  const org = await assertOrgRole(ctx, orgId, 'Admin');
  if (accountId === org.owner_account_id) {
    throw new ValidationError("The organization owner's role cannot be changed");
  }
  const { rowCount } = await getPool().query(
    `UPDATE organization_members SET role = $1, updated_at = now()
      WHERE organization_id = $2 AND account_id = $3`,
    [role, orgId, accountId],
  );
  if (!rowCount) throw new NotFoundError('Member not found in organization');
}

export async function removeOrgMember(
  ctx: FullAuthContext,
  orgId: string,
  accountId: string,
): Promise<void> {
  const org = await assertOrgRole(ctx, orgId, 'Admin');
  if (accountId === org.owner_account_id) {
    throw new ValidationError('The organization owner cannot be removed');
  }
  await getPool().query(
    'DELETE FROM organization_members WHERE organization_id = $1 AND account_id = $2',
    [orgId, accountId],
  );
}

// ---------------------------------------------------------------------------
// Workspace linkage (read-only listing; workspaces are parented at creation)
// ---------------------------------------------------------------------------

export async function listOrgWorkspaces(
  ctx: FullAuthContext,
  orgId: string,
): Promise<Array<{ id: string; slug: string; name: string; key: string }>> {
  await assertOrgRole(ctx, orgId, 'Viewer');
  const { rows } = await getPool().query<{ id: string; slug: string; name: string; key: string }>(
    'SELECT id, slug, name, key FROM workspaces WHERE organization_id = $1 ORDER BY name ASC',
    [orgId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Consolidated billing (XP-36)
// ---------------------------------------------------------------------------

/**
 * Resolve the org for the current workspace, ensuring one exists. With the
 * Org→Workspace invariant a workspace always has an org, but this stays
 * idempotent (and will create the account's org + link the workspace if a row
 * predates the invariant). Billing paths call this.
 */
export async function ensureWorkspaceOrg(ctx: FullAuthContext): Promise<OrganizationRow> {
  const existing = await getOrgForWorkspace(ctx.workspace.id);
  if (existing) return existing;

  // Predates the invariant — attach to the account's org (create if needed).
  const { withTransaction } = await import('@xpntl/db');
  return withTransaction(async (client) => {
    const org = await getOrCreateAccountOrgTx(client, ctx.account.id, {
      nameHint: ctx.account.display_name ?? ctx.workspace.name,
    });
    await linkWorkspaceToOrgTx(client, ctx.workspace.id, org.id);
    return org;
  });
}

/** Resolve a workspace's org (no role assertion) — for billing resolution. */
export async function getOrgForWorkspace(workspaceId: string): Promise<OrganizationRow | null> {
  const { rows } = await getPool().query<OrganizationRow>(
    `SELECT o.* FROM organizations o
       JOIN workspaces w ON w.organization_id = o.id
      WHERE w.id = $1`,
    [workspaceId],
  );
  return rows[0] ?? null;
}

export async function setOrgStripeCustomer(orgId: string, customerId: string): Promise<void> {
  await getPool().query(
    'UPDATE organizations SET stripe_customer_id = $1, updated_at = now() WHERE id = $2',
    [customerId, orgId],
  );
}

/** Distinct billable (non-agent) seats across every workspace in the org. */
export async function countOrgSeats(orgId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT u.account_id)::int AS count
       FROM users u
       JOIN workspaces w ON w.id = u.workspace_id
      WHERE w.organization_id = $1 AND u.is_agent = false`,
    [orgId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listOrgWorkspaceIds(orgId: string): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    'SELECT id FROM workspaces WHERE organization_id = $1',
    [orgId],
  );
  return rows.map((r) => r.id);
}

/**
 * Read-only consolidated-billing summary for the caller's own org (any member
 * can see their org's roster + seat count).
 */
export async function getOrgBillingSummary(ctx: FullAuthContext): Promise<{
  org: OrganizationRow;
  workspaces: Array<{ id: string; name: string; key: string }>;
  seats: number;
}> {
  const org = await ensureWorkspaceOrg(ctx);
  const { rows: workspaces } = await getPool().query<{ id: string; name: string; key: string }>(
    'SELECT id, name, key FROM workspaces WHERE organization_id = $1 ORDER BY name ASC',
    [org.id],
  );
  const seats = await countOrgSeats(org.id);
  return { org, workspaces, seats };
}
