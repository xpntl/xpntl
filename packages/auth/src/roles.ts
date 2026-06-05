/**
 * Role values stored in the database. Capitalized.
 *
 * CentrixIQ documented a case-drift bug: the DB enum is capitalized, some JWT paths
 * lowercase before emitting, some don't. Direct `role === 'admin'` comparisons fail
 * silently. We encode the fix here from day one: never compare role strings with `===`.
 * Use `eqRole` or `isAtLeast`.
 */

export const ROLES = ['Owner', 'Admin', 'Member', 'Guest'] as const;

export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = {
  Owner: 4,
  Admin: 3,
  Member: 2,
  Guest: 1,
};

/** Normalize an arbitrarily-cased role string to the canonical capitalized form. */
export function normalizeRole(role: string | null | undefined): Role | null {
  if (!role) return null;
  const lower = role.toLowerCase();
  return ROLES.find((r) => r.toLowerCase() === lower) ?? null;
}

/** Case-insensitive role equality. */
export function eqRole(role: string | null | undefined, target: Role): boolean {
  const normalized = normalizeRole(role);
  return normalized === target;
}

/** True if `role` is at or above the rank of `floor`. */
export function isAtLeast(role: string | null | undefined, floor: Role): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  return RANK[normalized] >= RANK[floor];
}
