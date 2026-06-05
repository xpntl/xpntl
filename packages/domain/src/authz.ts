import { type Role, isAtLeast } from '@xpntl/auth';
import { ForbiddenError } from './errors.js';
import type { FullAuthContext } from './types.js';

/**
 * Authorization is enforced here, not in routes. Adapters call `assertRole` or
 * the higher-level `assertCan` before delegating to a domain mutation.
 *
 * Today: role-floor checks. Coming: per-resource ACLs and visibility groups
 * ([architecture.md §7](../../../docs/architecture.md#7-multi-tenancy)).
 */
export function assertRole(ctx: FullAuthContext, floor: Role): void {
  if (!isAtLeast(ctx.user.role, floor)) {
    throw new ForbiddenError(`Requires role ${floor}`);
  }
}

/** Convenience: every authenticated user can read their workspace. */
export function canReadWorkspace(_ctx: FullAuthContext): boolean {
  return true;
}

/** Members and above can create issues. */
export function canCreateIssue(ctx: FullAuthContext): boolean {
  return isAtLeast(ctx.user.role, 'Member');
}

/** Members and above can update issues. Per-resource ACLs land later (§7). */
export function canUpdateIssue(ctx: FullAuthContext): boolean {
  return isAtLeast(ctx.user.role, 'Member');
}
