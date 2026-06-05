import type { Role } from '@xpntl/auth';

export type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  key: string;
  description: string | null;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AccountRow = {
  id: string;
  email: string;
  display_name: string | null;
  is_super_admin: boolean;
  is_founding: boolean;
  created_at: Date;
  updated_at: Date;
};

export type UserRow = {
  id: string;
  workspace_id: string;
  account_id: string;
  email: string;
  display_name: string | null;
  role: Role;
  is_super_admin: boolean;
  is_agent: boolean;
  agent_harness: string | null;
  avatar_url: string | null;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SessionRow = {
  id: string;
  account_id: string;
  user_id: string | null;
  workspace_id: string | null;
  token_hash: string;
  user_agent: string | null;
  ip: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  last_active_at: Date;
  created_at: Date;
};

export type WorkflowStateRow = {
  id: string;
  workspace_id: string;
  name: string;
  type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'review' | 'completed' | 'canceled';
  position: number;
  created_at: Date;
};

export type TeamRow = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  description: string | null;
  icon: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role: 'Lead' | 'Member';
  joined_at: Date;
};

export type InitiativeRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: 'planned' | 'active' | 'completed' | 'canceled';
  color: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  description: string | null;
  status: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  icon: string | null;
  color: string;
  lead_id: string | null;
  initiative_id: string | null;
  start_date: Date | null;
  target_date: Date | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type ProjectListRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  created_at: Date;
  updated_at: Date;
};

export type IssueKeyAliasRow = {
  id: string;
  workspace_id: string;
  issue_id: string;
  old_key: string;
  created_at: Date;
};

export type UserProjectPreferenceRow = {
  user_id: string;
  workspace_id: string;
  last_used_project_id: string | null;
  updated_at: Date;
};

export type MilestoneRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_date: Date | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type IssueRow = {
  id: string;
  workspace_id: string;
  key: string;
  title: string;
  description: string | null;
  state_id: string;
  priority: number;
  type: string;
  blocked: boolean;
  assignee_id: string | null;
  creator_id: string;
  parent_id: string | null;
  team_id: string | null;
  project_id: string;
  list_id: string | null;
  milestone_id: string | null;
  start_date: Date | null;
  due_date: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  custom_fields: Record<string, unknown>;
  cover_blob_ref: string | null;
  cover_position: number;
  recurrence_rule: string | null;
  recurrence_active: boolean;
  recurrence_next_at: Date | null;
  recurrence_source_id: string | null;
  sort_order: number;
};

export type ProjectTemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  variables: Array<{ key: string; label: string; defaultValue?: string }>;
  blueprint: {
    milestones?: Array<{ name: string; offsetDays?: number }>;
    issues?: Array<{
      title: string;
      description?: string;
      priority?: number;
      milestone?: string;
      labels?: string[];
    }>;
    labels?: Array<{ name: string; color: string }>;
    views?: Array<{ name: string; filters: Record<string, string> }>;
  };
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type IssueTemplateRow = {
  id: string;
  workspace_id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  template_title: string | null;
  template_body: string | null;
  priority: number;
  state_id: string | null;
  assignee_id: string | null;
  label_ids: string[];
  position: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TagRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_by: string | null;
  created_at: Date;
};

export type IssueTagRow = {
  issue_id: string;
  tag_id: string;
  tagged_at: Date;
  tagged_by: string | null;
};

export type CustomFieldRow = {
  id: string;
  workspace_id: string;
  slug: string;
  label: string;
  type: 'dropdown' | 'number' | 'url' | 'date';
  config: Record<string, unknown>;
  position: number;
  required: boolean;
  created_at: Date;
  updated_at: Date;
};

export type IssueAssigneeRow = {
  issue_id: string;
  user_id: string;
  position: number;
  assigned_at: Date;
  assigned_by: string | null;
};

export type CommentRow = {
  id: string;
  workspace_id: string;
  issue_id: string;
  author_id: string;
  body: string;
  edited_at: Date | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  created_at: Date;
  assignee_id: string | null;
  assigned_due_at: Date | null;
  assigned_resolved_at: Date | null;
  assigned_resolved_by: string | null;
  pinned_at: Date | null;
  pinned_by: string | null;
};

export type ReactionRow = {
  id: string;
  workspace_id: string;
  target_type: 'issue' | 'comment';
  target_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
};

/** Reactions grouped by emoji for display. `mine` is true if the requesting user
 *  has reacted with that emoji. */
export type ReactionSummary = {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
};

export type PlanRow = {
  id: string;
  name: string;
  price_cents: number;
  max_users: number | null;
  max_projects: number | null;
  max_harness_keys: number;
  features: Record<string, boolean>;
  created_at: Date;
};

export type SubscriptionRow = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type LicenseKeyRow = {
  id: string;
  key_hash: string;
  workspace_id: string;
  plan_id: string;
  issued_by: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_validated: Date | null;
  created_at: Date;
};

export type CodingHarnessKeyRow = {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_by: string | null;
  agent_user_id: string | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export type ApiKeyRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export type AccountProviderRow = {
  account_id: string;
  provider: 'password' | 'google' | 'github' | 'microsoft';
  provider_account_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

/** Pre-workspace auth context: account exists but no workspace yet (onboarding). */
export type PartialAuthContext = {
  session: SessionRow;
  account: AccountRow;
  user: null;
  workspace: null;
};

/** Fully resolved auth context with workspace membership. */
export type FullAuthContext = {
  session: SessionRow;
  account: AccountRow;
  user: UserRow;
  workspace: WorkspaceRow;
};

/** Auth context attached to an authenticated request. */
export type AuthContext = PartialAuthContext | FullAuthContext;
