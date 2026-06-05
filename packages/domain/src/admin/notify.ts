/**
 * Open-core stub for the hosted ops-notification seam (see notify.ts).
 *
 * The self-hostable build ships this file as `notify.ts`: notifications are a
 * no-op, so a self-hosted instance never emails the xpntl ops inbox.
 */

export type AdminEvent =
  | { kind: 'account.created'; email: string; displayName?: string | null }
  | { kind: 'workspace.created'; name: string; slug: string; ownerEmail: string }
  | { kind: 'feedback.created'; title: string; workspace: string; customer?: string | null }
  | { kind: 'plan.changed'; workspace: string; plan: string; status: string };

export function notifyAdmin(_event: AdminEvent): void {
  // No-op in the open build.
}
