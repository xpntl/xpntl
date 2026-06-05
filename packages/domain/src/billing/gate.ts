/**
 * Open-core stub for the feature-gating seam (see gate.ts).
 *
 * The self-hostable build ships this file as `gate.ts`: every limit is
 * unlimited and every feature is enabled. No commercial subscription code is
 * present. Keep the surface identical to `gate.ts`'s re-export.
 */
import type { PlanRow, SubscriptionRow } from '../types.js';

export type FeatureFlag =
  | 'custom_fields'
  | 'automations'
  | 'webhooks'
  | 'csv_import'
  | 'github_integration'
  | 'data_export'
  | 'audit_log'
  | 'analytics'
  | 'docs'
  | 'priority_support';

export async function enforceSubscriptionLimits(
  _ctx: { workspace: { id: string } },
  _check: 'users' | 'projects' | 'harness_keys',
): Promise<void> {
  // Self-host: unlimited. No-op.
}

export async function requireFeature(
  _ctx: { workspace: { id: string } },
  _feature: FeatureFlag,
): Promise<void> {
  // Self-host: every feature is enabled. No-op.
}

export async function hasFeature(
  _ctx: { workspace: { id: string } },
  _feature: FeatureFlag,
): Promise<boolean> {
  return true;
}

/**
 * Synthetic, unlimited "self-host" subscription. Callers that read the plan
 * (e.g. the workspace-count guard) see a non-free, uncapped plan.
 */
export async function getWorkspaceSubscription(
  ctx: { workspace: { id: string } },
): Promise<SubscriptionRow & { plan: PlanRow }> {
  const now = new Date();
  const plan: PlanRow = {
    id: 'self-host',
    name: 'Self-Host',
    price_cents: 0,
    max_users: null,
    max_projects: null,
    max_harness_keys: 1_000_000,
    features: {},
    created_at: now,
  };
  return {
    id: '',
    workspace_id: ctx.workspace.id,
    organization_id: null,
    plan_id: 'self-host',
    status: 'active',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at: null,
    created_at: now,
    updated_at: now,
    plan,
  };
}
