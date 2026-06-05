const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type ApiError = {
  status: number;
  code: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
};

export class FetchError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: Array<{ path: string; message: string }>;

  constructor(error: ApiError) {
    super(error.message);
    this.status = error.status;
    this.code = error.code;
    this.issues = error.issues;
  }
}

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | undefined>;
};

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token && !opts.token.startsWith('cookie:')) headers.authorization = `Bearer ${opts.token}`;

  let url = `${API_URL}${path}`;
  if (opts.query) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += (path.includes('?') ? '&' : '?') + qs;
  }

  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let body: { error?: { code: string; message: string; issues?: ApiError['issues'] } } = {};
    try {
      body = await res.json();
    } catch {
      /* swallow */
    }
    if (res.status === 401 && opts.token && !path.includes('/auth/login') && !path.includes('/auth/me')) {
      const { useAuth } = await import('./auth-store');
      useAuth.getState().clear();
      window.location.href = '/signin?reason=expired';
    }
    throw new FetchError({
      status: res.status,
      code: body.error?.code ?? 'unknown',
      message: body.error?.message ?? res.statusText,
      issues: body.error?.issues,
    });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Types -----------------------------------------------------------------

export type Workspace = { id: string; slug: string; name: string; key: string; avatarUrl?: string | null };

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isSuperAdmin: boolean;
};

export type WorkflowState = {
  id: string;
  name: string;
  type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'review' | 'completed' | 'canceled';
  position: number;
};

export type WorkspaceUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl?: string | null;
  role: string;
  isAgent?: boolean;
  agentHarness?: string | null;
  lastSeenAt?: string | null;
};

export type WorkspaceUsersPage = {
  users: WorkspaceUser[];
  nextCursor: string | null;
};

export type WorkspaceMembership = {
  workspace: Workspace;
  user: User;
  isCurrent: boolean;
  isDefault: boolean;
};

export type Plan = {
  id: string;
  name: string;
  priceCents: number;
  maxUsers: number | null;
  maxProjects: number | null;
  maxHarnessKeys: number;
  features: Record<string, boolean>;
};

export type Subscription = {
  id: string;
  workspaceId: string;
  planId: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  stripeCustomerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Label = {
  id: string;
  name: string;
  color: string;
  description?: string | null;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type Team = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'Lead' | 'Member';
  joinedAt: string;
};

export type Project = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  icon: string | null;
  color: string;
  leadId: string | null;
  initiativeId: string | null;
  startDate: string | null;
  targetDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectUpdateHealth = 'on_track' | 'at_risk' | 'off_track';
export type ProjectUpdate = {
  id: string;
  projectId: string;
  body: string;
  health: ProjectUpdateHealth;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectList = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ImportJob = {
  id: string;
  projectId: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  fieldMapping: Record<string, string>;
  errors: string[] | null;
  createdAt: string;
  completedAt: string | null;
};

export type Initiative = {
  id: string;
  name: string;
  description: string | null;
  status: 'planned' | 'active' | 'completed' | 'canceled';
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SubIssueCount = {
  total: number;
  completed: number;
  canceled: number;
  inProgress: number;
  progress: number;
};

export type Issue = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  stateId: string;
  priority: number;
  type: string;
  blocked: boolean;
  assigneeId: string | null;
  creatorId: string;
  parentId: string | null;
  teamId: string | null;
  projectId: string | null;
  listId: string | null;
  milestoneId: string | null;
  coverBlobRef: string | null;
  coverPosition: number;
  startDate: string | null;
  dueDate: string | null;
  assignee?: WorkspaceUser | null;
  assignees?: WorkspaceUser[];
  creator?: WorkspaceUser | null;
  createdAt: string;
  updatedAt: string;
  recurrenceRule: string | null;
  recurrenceActive: boolean;
  recurrenceNextAt: string | null;
  recurrenceSourceId: string | null;
  sortOrder: number;
  labels?: Label[];
  tags?: Tag[];
  subIssueCount?: SubIssueCount;
  checklistProgress?: { total: number; checked: number };
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
};

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedView = {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, string>;
  scope: 'personal' | 'workspace';
  icon: string | null;
  creatorId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Favorite = {
  id: string;
  entityType: 'issue' | 'project' | 'view';
  entityId: string;
  position: number;
  createdAt: string;
};

export type Comment = {
  id: string;
  issueId: string;
  authorId: string;
  author?: WorkspaceUser | null;
  body: string;
  mentionedUserIds: string[];
  mentionedUsers?: WorkspaceUser[];
  editedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  reactions: ReactionSummary[];
  assigneeId: string | null;
  assignee?: WorkspaceUser | null;
  assignedDueAt: string | null;
  assignedResolvedAt: string | null;
  assignedResolvedBy: string | null;
  pinnedAt: string | null;
  pinnedBy: string | null;
  pinnedByUser?: WorkspaceUser | null;
};

export type SessionInfo = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export type PendingInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedByName: string | null;
  invitedByEmail: string;
  createdAt: string;
};

export type IssueRelation = {
  id: string;
  fromIssueId: string;
  toIssueId: string;
  type: 'blocks' | 'blocked_by' | 'relates_to' | 'duplicate_of' | 'duplicated_by';
  relatedIssueKey: string;
  relatedIssueTitle: string;
  createdBy: string | null;
  createdAt: string;
};

export type Attachment = {
  id: string;
  issueId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string | null;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  issueId: string;
  actorId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
  action: 'state_change' | 'assignment_change' | 'priority_change' | 'label_change' | 'description_edit' | 'title_edit' | 'comment_added' | 'comment_resolved' | 'relation_added' | 'relation_removed';
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
};

export type ChecklistItem = {
  id: string;
  checklistId: string;
  content: string;
  checked: boolean;
  position: number;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Checklist = {
  id: string;
  issueId: string;
  title: string;
  position: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ChecklistItem[];
};

export type Milestone = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Notification = {
  id: string;
  workspaceId: string;
  userId: string;
  type: 'mention' | 'assigned' | 'state_change' | 'comment' | 'due_soon';
  title: string;
  body: string | null;
  issueId: string | null;
  issueKey: string | null;
  commentId: string | null;
  actorId: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  workspaceId: string;
  actorUserId: string;
  eventType: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
};

export type Doc = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  parentId: string | null;
  position: number;
  title: string;
  content: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocRevision = {
  id: string;
  docId: string;
  content: string;
  editedBy: string | null;
  createdAt: string;
};

export type AgentActivityEntry = {
  id: string;
  agentId: string;
  displayName: string | null;
  harness: string | null;
  avatarUrl: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type IssueFilterQuery = {
  q?: string;
  state?: string; // csv of state IDs
  stateType?: string; // csv of state type names (triage/backlog/unstarted/started/completed/canceled)
  priority?: string; // csv of priorities
  assignee?: string; // csv of user IDs or "me"
  projectId?: string;
  sort?: string;
};

// ---- Endpoints -------------------------------------------------------------

// ---- Auth response shapes --------------------------------------------------

export type LoginResponse =
  | { workspace: Workspace; user: User; token: string }
  | { step: 'onboarding'; account: { id: string; email: string }; token: string }
  | { step: 'choose_workspace'; token: string; memberships: Array<{ workspace: Workspace; user: User }> }
  | { step: 'mfa'; mfaToken: string };

export type MfaStatus = { enabled: boolean; pending: boolean; recoveryCodesRemaining: number };

export type Passkey = {
  id: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  transports: string[];
};

export const api = {
  async signup(input: {
    workspaceName: string;
    workspaceSlug: string;
    workspaceKey: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ workspace: Workspace; user: User; token: string }> {
    return request('/v1/auth/signup', { body: input });
  },

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ account: { id: string; email: string }; token: string }> {
    return request('/v1/auth/register', { body: input });
  },

  async onboarding(input: {
    workspaceName: string;
    workspaceSlug: string;
    workspaceKey: string;
  }, token?: string | null): Promise<{ workspace: Workspace; user: User }> {
    return request('/v1/auth/onboarding', { body: input, token });
  },

  async login(input: {
    email: string;
    password: string;
  }): Promise<LoginResponse> {
    return request('/v1/auth/login', { body: input });
  },

  async chooseWorkspace(workspaceId: string, token?: string | null): Promise<{ workspace: Workspace; user: User }> {
    return request('/v1/auth/choose-workspace', { body: { workspaceId }, token });
  },

  // ── MFA ──
  async verifyMfa(input: { mfaToken: string; code: string; workspaceId?: string }): Promise<LoginResponse> {
    return request('/v1/auth/verify-mfa', { body: input });
  },
  async mfaStatus(token?: string | null): Promise<MfaStatus> {
    return request('/v1/auth/mfa', { token });
  },
  async mfaStart(token?: string | null): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    return request('/v1/auth/mfa/start', { method: 'POST', token });
  },
  async mfaConfirm(code: string, token?: string | null): Promise<{ recoveryCodes: string[] }> {
    return request('/v1/auth/mfa/confirm', { method: 'POST', body: { code }, token });
  },
  async mfaRegenerateRecoveryCodes(code: string, token?: string | null): Promise<{ recoveryCodes: string[] }> {
    return request('/v1/auth/mfa/recovery-codes', { method: 'POST', body: { code }, token });
  },
  async mfaDisable(code: string, token?: string | null): Promise<void> {
    await request('/v1/auth/mfa/disable', { method: 'POST', body: { code }, token });
  },

  // ── Passkeys (WebAuthn) ──
  async listPasskeys(token?: string | null): Promise<{ passkeys: Passkey[] }> {
    return request('/v1/auth/passkeys', { token });
  },
  async deletePasskey(id: string, token?: string | null): Promise<void> {
    await request(`/v1/auth/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },
  async passkeyRegisterOptions(token?: string | null): Promise<{ options: unknown; challengeId: string }> {
    return request('/v1/auth/passkeys/register/options', { method: 'POST', token });
  },
  async passkeyRegisterVerify(
    input: { challengeId: string; response: unknown; name?: string },
    token?: string | null,
  ): Promise<{ passkey: { id: string; name: string | null } }> {
    return request('/v1/auth/passkeys/register/verify', { method: 'POST', body: input, token });
  },
  async passkeyAuthOptions(): Promise<{ options: unknown; challengeId: string }> {
    return request('/v1/auth/passkeys/authenticate/options', { method: 'POST' });
  },
  async passkeyAuthVerify(input: { challengeId: string; response: unknown; workspaceId?: string }): Promise<LoginResponse> {
    return request('/v1/auth/passkeys/authenticate/verify', { body: input });
  },

  async logout(token?: string | null): Promise<void> {
    await request('/v1/auth/logout', { method: 'POST', token });
  },

  async me(token?: string | null): Promise<{
    authenticated?: boolean;
    account?: { id: string; email: string } | null;
    workspace?: Workspace | null;
    user?: User | null;
    hasPassword?: boolean;
    providers?: string[];
  }> {
    return request('/v1/auth/me', { method: 'GET', token });
  },

  async deviceApprove(userCode: string, token?: string | null): Promise<{ ok: boolean }> {
    return request('/v1/auth/device/approve', { method: 'POST', body: { userCode }, token });
  },

  async listWorkspaceMemberships(
    token?: string | null,
  ): Promise<{ memberships: WorkspaceMembership[] }> {
    return request('/v1/workspaces/memberships', { token });
  },

  // Set (or clear, with null) the account's default workspace. The sign-in
  // chooser auto-selects it on subsequent logins.
  async setDefaultWorkspace(
    workspaceId: string | null,
    token?: string | null,
  ): Promise<{ defaultWorkspaceId: string | null }> {
    return request('/v1/workspaces/default', { method: 'POST', body: { workspaceId }, token });
  },

  async createWorkspaceFromSession(
    input: {
      workspaceName: string;
      workspaceSlug: string;
      workspaceKey: string;
      displayName?: string;
    },
    token?: string | null,
  ): Promise<{ workspace: Workspace; user: User; token: string }> {
    return request('/v1/workspaces', { method: 'POST', body: input, token });
  },

  async switchWorkspace(
    input: { workspaceId?: string; workspaceSlug?: string },
    token?: string | null,
  ): Promise<{ workspace: Workspace; user: User; token: string }> {
    return request('/v1/workspaces/switch', { method: 'POST', body: input, token });
  },

  // Accept an emailed workspace invite. Returns a session bound to the joined
  // workspace (same shape as switchWorkspace) — pass straight to setSession.
  async acceptInvite(
    inviteToken: string,
    token?: string | null,
  ): Promise<{ workspace: Workspace; user: User; token: string }> {
    return request('/v1/invites/accept', { method: 'POST', body: { token: inviteToken }, token });
  },

  async listWorkflowStates(token?: string | null): Promise<{ states: WorkflowState[] }> {
    return request('/v1/workflow-states', { token });
  },

  async listUsers(
    token?: string | null,
    opts?: { limit?: number; cursor?: string },
  ): Promise<WorkspaceUsersPage> {
    return request('/v1/users', { token, query: opts });
  },

  async listTeams(token?: string | null): Promise<{ teams: Team[] }> {
    return request('/v1/teams', { token });
  },

  async createTeam(
    input: { name: string; key: string; description?: string },
    token?: string | null,
  ): Promise<{ team: Team }> {
    return request('/v1/teams', { method: 'POST', body: input, token });
  },

  async getTeam(id: string, token?: string | null): Promise<{ team: Team }> {
    return request(`/v1/teams/${encodeURIComponent(id)}`, { token });
  },

  async listTeamMembers(id: string, token?: string | null): Promise<{ members: TeamMember[] }> {
    return request(`/v1/teams/${encodeURIComponent(id)}/members`, { token });
  },

  async listProjects(token?: string | null): Promise<{ projects: Project[] }> {
    return request('/v1/projects', { token });
  },

  async createProject(
    input: {
      name: string;
      key: string;
      description?: string;
      color?: string;
      leadId?: string;
      initiativeId?: string;
    },
    token?: string | null,
  ): Promise<{ project: Project }> {
    return request('/v1/projects', { method: 'POST', body: input, token });
  },

  async getProject(id: string, token?: string | null): Promise<{ project: Project }> {
    return request(`/v1/projects/${encodeURIComponent(id)}`, { token });
  },

  async updateProject(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      status?: string;
      leadId?: string | null;
      initiativeId?: string | null;
      targetDate?: string;
    },
    token?: string | null,
  ): Promise<{ project: Project }> {
    return request(`/v1/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      token,
    });
  },

  async deleteProject(id: string, token?: string | null): Promise<void> {
    await request(`/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  // ── Real-time sync (XP-3) ──
  async createSyncTicket(token?: string | null): Promise<{ ticket: string }> {
    return request('/v1/sync/ticket', { method: 'POST', token });
  },

  // ── Lists within a project (XP-74) ──
  async listProjectLists(
    projectId: string,
    token?: string | null,
  ): Promise<{ lists: ProjectList[] }> {
    return request(`/v1/projects/${encodeURIComponent(projectId)}/lists`, { token });
  },

  async createProjectList(
    projectId: string,
    input: { name: string; color?: string },
    token?: string | null,
  ): Promise<{ list: ProjectList }> {
    return request(`/v1/projects/${encodeURIComponent(projectId)}/lists`, {
      method: 'POST',
      body: input,
      token,
    });
  },

  async updateProjectList(
    projectId: string,
    listId: string,
    patch: { name?: string; color?: string },
    token?: string | null,
  ): Promise<{ list: ProjectList }> {
    return request(
      `/v1/projects/${encodeURIComponent(projectId)}/lists/${encodeURIComponent(listId)}`,
      { method: 'PATCH', body: patch, token },
    );
  },

  async deleteProjectList(
    projectId: string,
    listId: string,
    token?: string | null,
  ): Promise<void> {
    await request(
      `/v1/projects/${encodeURIComponent(projectId)}/lists/${encodeURIComponent(listId)}`,
      { method: 'DELETE', token },
    );
  },

  async reorderProjectLists(
    projectId: string,
    orderedIds: string[],
    token?: string | null,
  ): Promise<{ lists: ProjectList[] }> {
    return request(`/v1/projects/${encodeURIComponent(projectId)}/lists/reorder`, {
      method: 'PATCH',
      body: { orderedIds },
      token,
    });
  },

  async listInitiatives(token?: string | null): Promise<{ initiatives: Initiative[] }> {
    return request('/v1/initiatives', { token });
  },

  async createInitiative(
    input: { name: string; description?: string; color?: string },
    token?: string | null,
  ): Promise<{ initiative: Initiative }> {
    return request('/v1/initiatives', { method: 'POST', body: input, token });
  },

  async listMilestones(
    projectId: string,
    token?: string | null,
  ): Promise<{ milestones: Milestone[] }> {
    return request('/v1/milestones', { token, query: { projectId } });
  },

  async createMilestone(
    input: { projectId: string; name: string; description?: string; targetDate?: string },
    token?: string | null,
  ): Promise<{ milestone: Milestone }> {
    return request('/v1/milestones', { method: 'POST', body: input, token });
  },

  async updateMilestone(
    id: string,
    patch: { name?: string; description?: string | null; targetDate?: string | null },
    token?: string | null,
  ): Promise<{ milestone: Milestone }> {
    return request(`/v1/milestones/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      token,
    });
  },

  async deleteMilestone(id: string, token?: string | null): Promise<void> {
    await request(`/v1/milestones/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async listLabels(token?: string | null): Promise<{ labels: Label[] }> {
    return request('/v1/labels', { token });
  },

  async createLabel(
    input: { name: string; color?: string; description?: string | null },
    token?: string | null,
  ): Promise<{ label: Label }> {
    return request('/v1/labels', { method: 'POST', body: input, token });
  },

  async updateLabel(
    id: string,
    input: { name?: string; color?: string; description?: string | null },
    token?: string | null,
  ): Promise<{ label: Label }> {
    return request(`/v1/labels/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
      token,
    });
  },

  async deleteLabel(id: string, token?: string | null): Promise<void> {
    await request(`/v1/labels/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async attachLabel(
    key: string,
    labelId: string,
    token?: string | null,
  ): Promise<{ labels: Label[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/labels`, {
      method: 'POST',
      body: { labelId },
      token,
    });
  },

  async detachLabel(
    key: string,
    labelId: string,
    token?: string | null,
  ): Promise<{ labels: Label[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/labels/${encodeURIComponent(labelId)}`, {
      method: 'DELETE',
      token,
    });
  },

  // Tags
  async listTags(token?: string | null): Promise<{ tags: Tag[] }> {
    return request('/v1/tags', { token });
  },

  async createTag(
    input: { name: string; color?: string },
    token?: string | null,
  ): Promise<{ tag: Tag }> {
    return request('/v1/tags', { method: 'POST', body: input, token });
  },

  async deleteTag(id: string, token?: string | null): Promise<void> {
    await request(`/v1/tags/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async attachTag(
    key: string,
    tagId: string,
    token?: string | null,
  ): Promise<{ tags: Tag[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/tags`, {
      method: 'POST',
      body: { tagId },
      token,
    });
  },

  async detachTag(
    key: string,
    tagId: string,
    token?: string | null,
  ): Promise<{ tags: Tag[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/tags/${encodeURIComponent(tagId)}`, {
      method: 'DELETE',
      token,
    });
  },

  async issueCounts(token?: string | null): Promise<{ triage: number; my: number; active: number; backlog: number; all: number }> {
    return request('/v1/issues/counts', { token });
  },

  async listIssues(filter: IssueFilterQuery, token?: string | null): Promise<{ issues: Issue[] }> {
    return request('/v1/issues', { token, query: filter });
  },

  async getIssue(
    key: string,
    token?: string | null,
  ): Promise<{ issue: Issue; reactions: ReactionSummary[]; relations: IssueRelation[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}`, { token });
  },

  async createIssue(
    input: { title: string; description?: string; priority?: number; type?: string; stateId?: string; assigneeId?: string; projectId: string; parentId?: string },
    token?: string | null,
  ): Promise<{ issue: Issue }> {
    return request('/v1/issues', { method: 'POST', body: input, token });
  },

  async moveIssue(
    key: string,
    targetProjectId: string,
    token?: string | null,
  ): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/move`, {
      method: 'PUT',
      body: { targetProjectId },
      token,
    });
  },

  async getLastUsedProjectId(token?: string | null): Promise<{ projectId: string | null }> {
    return request('/v1/issues/last-used-project', { token });
  },

  async listSubIssues(key: string, token?: string | null): Promise<{ issues: Issue[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/sub-issues`, { token });
  },

  async deleteIssue(key: string, token?: string | null): Promise<void> {
    await request(`/v1/issues/${encodeURIComponent(key)}`, { method: 'DELETE', token });
  },

  async restoreIssue(key: string, token?: string | null): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/restore`, { method: 'POST', token });
  },

  async listDeletedIssues(token?: string | null): Promise<{ issues: Issue[] }> {
    return request('/v1/issues/deleted', { token });
  },

  async setAssignees(key: string, userIds: string[], token?: string | null): Promise<{ assignees: Array<{ userId: string }> }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/assignees`, { method: 'PUT', body: { userIds }, token });
  },

  async archiveIssue(key: string, token?: string | null): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/archive`, { method: 'POST', token });
  },

  async unarchiveIssue(key: string, token?: string | null): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/unarchive`, { method: 'POST', token });
  },

  async listArchivedIssues(
    projectId?: string,
    token?: string | null,
  ): Promise<{ issues: Issue[] }> {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return request(`/v1/issues/archived${qs}`, { token });
  },

  async updateIssue(
    key: string,
    patch: {
      title?: string;
      description?: string | null;
      stateId?: string;
      priority?: number;
      type?: string;
      blocked?: boolean;
      assigneeId?: string | null;
      parentId?: string | null;
      listId?: string | null;
      milestoneId?: string | null;
      coverBlobRef?: string | null;
      coverPosition?: number;
      startDate?: string | null;
      dueDate?: string | null;
      sortOrder?: number;
    },
    token?: string | null,
  ): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: patch,
      token,
    });
  },

  async bulkUpdateIssues(
    keys: string[],
    patch: {
      stateId?: string;
      priority?: number;
      assigneeId?: string | null;
      blocked?: boolean;
    },
    token?: string | null,
  ): Promise<{ issues: Issue[] }> {
    return request('/v1/issues/bulk', {
      method: 'PATCH',
      body: { keys, patch },
      token,
    });
  },

  async toggleIssueReaction(
    key: string,
    emoji: string,
    token?: string | null,
  ): Promise<{ added: boolean }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/reactions/toggle`, {
      method: 'POST',
      body: { emoji },
      token,
    });
  },

  async listComments(key: string, token?: string | null): Promise<{ comments: Comment[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/comments`, { token });
  },

  async createComment(
    key: string,
    body: string,
    token?: string | null,
    mentionedUserIds?: string[],
  ): Promise<{ comment: Comment }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/comments`, {
      method: 'POST',
      body: {
        body,
        ...(mentionedUserIds && mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
      },
      token,
    });
  },

  async deleteComment(id: string, token?: string | null): Promise<void> {
    await request(`/v1/comments/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async toggleCommentReaction(
    id: string,
    emoji: string,
    token?: string | null,
  ): Promise<{ added: boolean }> {
    return request(`/v1/comments/${encodeURIComponent(id)}/reactions/toggle`, {
      method: 'POST',
      body: { emoji },
      token,
    });
  },

  async resolveComment(
    issueKey: string,
    commentId: string,
    token?: string | null,
  ): Promise<{ comment: Comment }> {
    return request(
      `/v1/issues/${encodeURIComponent(issueKey)}/comments/${encodeURIComponent(commentId)}/resolve`,
      { method: 'POST', token },
    );
  },

  async unresolveComment(
    issueKey: string,
    commentId: string,
    token?: string | null,
  ): Promise<{ comment: Comment }> {
    return request(
      `/v1/issues/${encodeURIComponent(issueKey)}/comments/${encodeURIComponent(commentId)}/resolve`,
      { method: 'DELETE', token },
    );
  },

  async assignComment(commentId: string, assigneeId: string, dueAt?: string | null, token?: string | null) {
    return request<{ comment: { id: string; assigneeId: string | null; assignedDueAt: string | null; assignedResolvedAt: string | null; assignedResolvedBy: string | null } }>(
      `/v1/comments/${encodeURIComponent(commentId)}/assign`,
      { method: 'POST', body: { assigneeId, dueAt: dueAt ?? null }, token },
    );
  },
  async resolveAssignedComment(commentId: string, token?: string | null) {
    return request<{ comment: { id: string; assigneeId: string | null; assignedDueAt: string | null; assignedResolvedAt: string | null; assignedResolvedBy: string | null } }>(
      `/v1/comments/${encodeURIComponent(commentId)}/resolve`,
      { method: 'POST', token },
    );
  },
  async unassignComment(commentId: string, token?: string | null) {
    return request<{ comment: { id: string; assigneeId: string | null; assignedDueAt: string | null; assignedResolvedAt: string | null; assignedResolvedBy: string | null } }>(
      `/v1/comments/${encodeURIComponent(commentId)}/assign`,
      { method: 'DELETE', token },
    );
  },

  async pinComment(commentId: string, token?: string | null): Promise<{ comment: { id: string; pinnedAt: string; pinnedBy: string } }> { return request(`/v1/comments/${encodeURIComponent(commentId)}/pin`, { method: 'POST', token }); },

  async unpinComment(commentId: string, token?: string | null): Promise<{ comment: { id: string; pinnedAt: null; pinnedBy: null } }> { return request(`/v1/comments/${encodeURIComponent(commentId)}/pin`, { method: 'DELETE', token }); },

  // Checklists
  async listChecklists(key: string, token?: string | null): Promise<{ checklists: Checklist[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/checklists`, { token });
  },

  async createChecklist(
    key: string,
    title?: string,
    token?: string | null,
  ): Promise<{ checklist: Checklist }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/checklists`, {
      method: 'POST',
      body: { title },
      token,
    });
  },

  async updateChecklist(
    id: string,
    patch: { title?: string; position?: number },
    token?: string | null,
  ): Promise<{ checklist: Omit<Checklist, 'items'> }> {
    return request(`/v1/issues/checklists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      token,
    });
  },

  async deleteChecklist(id: string, token?: string | null): Promise<void> {
    await request(`/v1/issues/checklists/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async addChecklistItem(
    checklistId: string,
    input: { content: string; assigneeId?: string; dueDate?: string },
    token?: string | null,
  ): Promise<{ item: ChecklistItem }> {
    return request(`/v1/issues/checklists/${encodeURIComponent(checklistId)}/items`, {
      method: 'POST',
      body: input,
      token,
    });
  },

  async updateChecklistItem(
    id: string,
    patch: {
      content?: string;
      checked?: boolean;
      position?: number;
      assigneeId?: string | null;
      dueDate?: string | null;
    },
    token?: string | null,
  ): Promise<{ item: ChecklistItem }> {
    return request(`/v1/issues/checklist-items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      token,
    });
  },

  async deleteChecklistItem(id: string, token?: string | null): Promise<void> {
    await request(`/v1/issues/checklist-items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    });
  },

  // Attachments
  async listAttachments(
    key: string,
    token?: string | null,
  ): Promise<{ attachments: Attachment[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/attachments`, { token });
  },

  async uploadAttachment(
    key: string,
    file: File,
    token?: string | null,
  ): Promise<{ attachment: Attachment }> {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/issues/${encodeURIComponent(key)}/attachments`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  async uploadCoverImage(
    key: string,
    file: File,
    token?: string | null,
  ): Promise<{ coverUrl: string; attachment: Attachment }> {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/issues/${encodeURIComponent(key)}/cover`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  async removeCoverImage(key: string, token?: string | null): Promise<void> {
    await request(`/v1/issues/${encodeURIComponent(key)}/cover`, { method: 'DELETE', token });
  },

  // Recurrence
  async setRecurrence(
    key: string,
    input: { rule: string; active?: boolean },
    token?: string | null,
  ): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/recurrence`, {
      method: 'POST',
      body: input,
      token,
    });
  },

  async clearRecurrence(key: string, token?: string | null): Promise<{ issue: Issue }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/recurrence`, {
      method: 'DELETE',
      token,
    });
  },

  async deleteAttachment(id: string, token?: string | null): Promise<void> {
    await request(`/v1/issues/attachments/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  // Activity
  async listActivity(
    key: string,
    opts?: { limit?: number; cursor?: string },
    token?: string | null,
  ): Promise<{ activity: ActivityEntry[]; nextCursor: string | null }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/activity`, { token, query: opts });
  },

  // Relations
  async listRelations(key: string, token?: string | null): Promise<{ relations: IssueRelation[] }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/relations`, { token });
  },

  async createRelation(
    key: string,
    input: { toIssueKey: string; type: IssueRelation['type'] },
    token?: string | null,
  ): Promise<{ relation: IssueRelation }> {
    return request(`/v1/issues/${encodeURIComponent(key)}/relations`, {
      method: 'POST',
      body: input,
      token,
    });
  },

  async deleteRelation(
    key: string,
    input: { toIssueKey: string; type: IssueRelation['type'] },
    token?: string | null,
  ): Promise<void> {
    await request(`/v1/issues/${encodeURIComponent(key)}/relations`, {
      method: 'DELETE',
      body: input,
      token,
    });
  },

  // Favorites
  async listFavorites(
    entityType?: 'issue' | 'project' | 'view',
    token?: string | null,
  ): Promise<{ favorites: Favorite[] }> {
    const query: Record<string, string> = {};
    if (entityType) query.entityType = entityType;
    return request('/v1/favorites', { token, query });
  },

  async toggleFavorite(
    entityType: 'issue' | 'project' | 'view',
    entityId: string,
    token?: string | null,
  ): Promise<{ favorited: boolean }> {
    return request('/v1/favorites/toggle', {
      method: 'POST',
      body: { entityType, entityId },
      token,
    });
  },

  // Saved views
  async listViews(token?: string | null): Promise<{ views: SavedView[] }> {
    return request('/v1/views', { token });
  },

  async createView(
    input: { name: string; filters: Record<string, string>; scope?: string; description?: string },
    token?: string | null,
  ): Promise<{ view: SavedView }> {
    return request('/v1/views', { method: 'POST', body: input, token });
  },

  async deleteView(id: string, token?: string | null): Promise<void> {
    await request(`/v1/views/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  // Settings — Profile
  async updateProfile(
    input: { displayName?: string },
    token?: string | null,
  ): Promise<{ user: User }> {
    return request('/v1/users/me', { method: 'PATCH', body: input, token });
  },

  async changePassword(
    input: { currentPassword: string; newPassword: string },
    token?: string | null,
  ): Promise<{ ok: boolean }> {
    return request('/v1/users/me/password', { method: 'PATCH', body: input, token });
  },

  async listSessions(token?: string | null): Promise<{ sessions: SessionInfo[] }> {
    return request('/v1/users/me/sessions', { token });
  },

  async revokeSession(sessionId: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/users/me/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      token,
    });
  },

  async revokeAllSessions(token?: string | null): Promise<{ revoked: number }> {
    return request('/v1/users/me/sessions', { method: 'DELETE', token });
  },

  async updateAvatar(file: File, token?: string | null): Promise<{ avatarUrl: string }> {
    const form = new FormData();
    form.append('avatar', file);
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/users/me/avatar`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  async updateWorkspaceAvatar(file: File, token?: string | null): Promise<{ avatarUrl: string }> {
    const form = new FormData();
    form.append('avatar', file);
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/workspaces/avatar`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  // Settings — Workspace
  async updateWorkspace(
    input: { name?: string; description?: string | null },
    token?: string | null,
  ): Promise<{ workspace: Workspace & { description: string | null } }> {
    return request('/v1/workspaces/current', { method: 'PATCH', body: input, token });
  },

  async transferWorkspaceOwnership(
    newOwnerId: string,
    token?: string | null,
  ): Promise<{ ok: boolean }> {
    return request('/v1/workspaces/transfer-ownership', {
      method: 'POST',
      body: { newOwnerId },
      token,
    });
  },

  async deleteCurrentWorkspace(token?: string | null): Promise<void> {
    await request('/v1/workspaces/current', { method: 'DELETE', token });
  },

  async changeUserRole(
    userId: string,
    role: string,
    token?: string | null,
  ): Promise<{ user: WorkspaceUser }> {
    return request(`/v1/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: { role },
      token,
    });
  },

  async removeUser(userId: string, token?: string | null): Promise<void> {
    await request(`/v1/users/${encodeURIComponent(userId)}`, { method: 'DELETE', token });
  },

  async inviteUser(
    input: { email: string; role?: string; displayName?: string },
    token?: string | null,
  ): Promise<{ user: WorkspaceUser }> {
    return request('/v1/users/invite', { method: 'POST', body: input, token });
  },

  // Pending invites
  async listPendingInvites(token?: string | null): Promise<{ invites: PendingInvite[] }> {
    return request('/v1/users/pending-invites', { token });
  },

  async createPendingInvite(
    input: { email: string; role?: string },
    token?: string | null,
  ): Promise<{ invite: PendingInvite }> {
    return request('/v1/users/pending-invites', { method: 'POST', body: input, token });
  },

  async resendPendingInvite(inviteId: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/users/pending-invites/${encodeURIComponent(inviteId)}/resend`, {
      method: 'POST',
      token,
    });
  },

  async revokePendingInvite(inviteId: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/users/pending-invites/${encodeURIComponent(inviteId)}`, {
      method: 'DELETE',
      token,
    });
  },

  // Billing
  async listPlans(): Promise<{ plans: Plan[] }> {
    return request('/v1/billing/plans');
  },

  async getSubscription(token?: string | null): Promise<{ subscription: Subscription; plan: Plan }> {
    return request('/v1/billing/subscription', { token });
  },

  async createCheckout(
    input: { planId: string; interval: 'annual' | 'monthly'; seats: number; successUrl: string; cancelUrl: string },
    token?: string | null,
  ): Promise<{ url: string }> {
    return request('/v1/billing/checkout', { method: 'POST', body: input, token });
  },

  // API Keys
  async listApiKeys(token?: string | null): Promise<{ keys: Array<{ id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; createdAt: string }> }> {
    return request('/v1/api-keys', { token });
  },

  async createApiKey(
    input: { name: string; scopes: string[] },
    token?: string | null,
  ): Promise<{ key: string; record: { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; createdAt: string } }> {
    return request('/v1/api-keys', { method: 'POST', body: input, token });
  },

  async revokeApiKey(id: string, token?: string | null): Promise<void> {
    await request(`/v1/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  // Notifications
  async listNotifications(
    opts?: {
      unread?: boolean;
      /** 'active' (default) excludes archived. 'archived' returns only archived. 'all' returns both. */
      archived?: 'active' | 'archived' | 'all';
      limit?: number;
      cursor?: string;
    },
    token?: string | null,
  ): Promise<{ notifications: Notification[] }> {
    const query: Record<string, string | number> = {};
    if (opts?.unread) query.unread = 'true';
    if (opts?.archived) query.archived = opts.archived;
    if (opts?.limit) query.limit = opts.limit;
    if (opts?.cursor) query.cursor = opts.cursor;
    return request('/v1/notifications', { token, query });
  },

  async getUnreadCount(token?: string | null): Promise<{ count: number }> {
    return request('/v1/notifications/unread-count', { token });
  },

  async markNotificationRead(id: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', token });
  },

  async markNotificationUnread(id: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/notifications/${encodeURIComponent(id)}/unread`, { method: 'PATCH', token });
  },

  async archiveNotification(id: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/notifications/${encodeURIComponent(id)}/archive`, { method: 'PATCH', token });
  },

  async unarchiveNotification(id: string, token?: string | null): Promise<{ ok: boolean }> {
    return request(`/v1/notifications/${encodeURIComponent(id)}/unarchive`, { method: 'PATCH', token });
  },

  async markAllNotificationsRead(token?: string | null): Promise<{ marked: number }> {
    return request('/v1/notifications/mark-all-read', { method: 'POST', token });
  },

  // Automations
  async listAutomations(token?: string | null): Promise<{ automations: Automation[] }> {
    return request('/v1/automations', { token });
  },

  async createAutomation(
    input: {
      name: string;
      triggerType: string;
      triggerConfig?: Record<string, unknown>;
      actionType: string;
      actionConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
    token?: string | null,
  ): Promise<{ automation: Automation }> {
    return request('/v1/automations', { method: 'POST', body: input, token });
  },

  async updateAutomation(
    id: string,
    input: {
      name?: string;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
      actionType?: string;
      actionConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
    token?: string | null,
  ): Promise<{ automation: Automation }> {
    return request(`/v1/automations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      token,
    });
  },

  async deleteAutomation(id: string, token?: string | null): Promise<void> {
    await request(`/v1/automations/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async listRecentIssues(token?: string | null, limit = 8): Promise<{ recentIssues: Array<{ id: string; issueKey: string; issueTitle: string; viewedAt: string }> }> {
    return request(`/v1/recent-issues?limit=${limit}`, { token });
  },

  async pushRecentIssue(issueKey: string, issueTitle: string, token?: string | null): Promise<{ recentIssue: { id: string; issueKey: string; issueTitle: string; viewedAt: string } }> {
    return request('/v1/recent-issues', { method: 'POST', token, body: { issueKey, issueTitle } });
  },

  // Agents
  async createAgentKey(agentId: string, token?: string | null): Promise<{ key: string; keyId: string }> {
    return request(`/v1/agents/${encodeURIComponent(agentId)}/keys`, { method: 'POST', token });
  },

  async createAgent(
    input: { displayName: string; harness: string },
    token?: string | null,
  ): Promise<{ user: WorkspaceUser }> {
    return request('/v1/agents', { method: 'POST', body: input, token });
  },

  async updateAgent(
    id: string,
    input: { displayName?: string; harness?: string; avatarUrl?: string | null },
    token?: string | null,
  ): Promise<{ user: WorkspaceUser }> {
    return request(`/v1/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, token });
  },

  async updateAgentAvatar(
    id: string,
    file: File,
    token?: string | null,
  ): Promise<{ avatarUrl: string; user: WorkspaceUser }> {
    const form = new FormData();
    form.append('avatar', file);
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/agents/${encodeURIComponent(id)}/avatar`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  async deleteAgent(id: string, token?: string | null): Promise<void> {
    await request(`/v1/agents/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async listAgentActivity(
    opts?: { agentId?: string; limit?: number; cursor?: string },
    token?: string | null,
  ): Promise<{ entries: AgentActivityEntry[] }> {
    return request('/v1/agents/activity', { token, query: opts as Record<string, string | number | undefined> });
  },

  // Webhooks
  async listWebhooks(token?: string | null): Promise<{ webhooks: Array<{ id: string; url: string; events: string[]; active: boolean; description: string | null; createdAt: string }> }> {
    return request('/v1/webhooks', { token });
  },
  async createWebhook(input: { url: string; events: string[]; description?: string }, token?: string | null): Promise<any> {
    return request('/v1/webhooks', { method: 'POST', body: input, token });
  },
  async updateWebhook(id: string, input: { url?: string; events?: string[]; description?: string | null; active?: boolean }, token?: string | null): Promise<any> {
    return request(`/v1/webhooks/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, token });
  },
  async deleteWebhook(id: string, token?: string | null): Promise<void> {
    await request(`/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  // Notification Preferences
  async getNotificationPreferences(token?: string | null): Promise<{ mention: boolean; assigned: boolean; stateChange: boolean; comment: boolean; dueSoon: boolean; emailDigest: string }> {
    return request('/v1/notifications/preferences', { token });
  },
  async updateNotificationPreferences(input: { mention?: boolean; assigned?: boolean; stateChange?: boolean; comment?: boolean; dueSoon?: boolean; emailDigest?: string }, token?: string | null): Promise<any> {
    return request('/v1/notifications/preferences', { method: 'PATCH', body: input, token });
  },

  // GitHub Integration
  async listGitHubIntegrations(token?: string | null): Promise<{ integrations: Array<{ id: string; owner: string; repo: string; active: boolean; webhookSecret: string; createdAt: string }> }> {
    return request('/v1/github/integrations', { token });
  },
  async createGitHubIntegration(input: { owner: string; repo: string }, token?: string | null): Promise<any> {
    return request('/v1/github/integrations', { method: 'POST', body: input, token });
  },
  async deleteGitHubIntegration(id: string, token?: string | null): Promise<void> {
    await request(`/v1/github/integrations/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },
  async listPrLinks(issueKey: string, token?: string | null): Promise<{ prLinks: Array<{ id: string; prNumber: number; prUrl: string; prTitle: string | null; repoOwner: string; repoName: string; status: string; createdAt: string }> }> {
    return request(`/v1/github/issues/${encodeURIComponent(issueKey)}/pr-links`, { token });
  },

  // CSV Import
  async previewCsvImport(
    file: File,
    token?: string | null,
  ): Promise<{ headers: string[]; sampleRows: string[][]; totalRows: number }> {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/imports/csv/preview`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  async startCsvImport(
    file: File,
    meta: { projectId?: string; mapping: Record<string, string> },
    token?: string | null,
  ): Promise<ImportJob> {
    const form = new FormData();
    form.append('file', file);
    form.append('metadata', JSON.stringify(meta));
    const headers: Record<string, string> = {};
    if (token && !token.startsWith('cookie:')) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/v1/imports/csv`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string } } = {};
      try {
        body = await res.json();
      } catch {}
      throw new FetchError({
        status: res.status,
        code: body.error?.code ?? 'unknown',
        message: body.error?.message ?? res.statusText,
      });
    }
    return res.json();
  },

  // biome-ignore lint/suspicious/noExplicitAny: shared by the Jira + CSV wizards which keep their own job shapes
  async getImportJob(id: string, token?: string | null): Promise<any> {
    return request(`/v1/imports/jobs/${encodeURIComponent(id)}`, { token });
  },
  // biome-ignore lint/suspicious/noExplicitAny: see getImportJob
  async listImportJobs(token?: string | null): Promise<{ jobs: any[] }> {
    return request('/v1/imports/jobs', { token });
  },

  // Audit Log
  async listAuditLog(
    opts?: { eventType?: string; targetType?: string; actorId?: string; limit?: number; cursor?: string },
    token?: string | null,
  ): Promise<{ entries: AuditLogEntry[] }> {
    return request('/v1/audit', { token, query: opts as Record<string, string | number | undefined> });
  },

  // Analytics / Insights
  async getCycleTime(
    opts?: { projectId?: string; days?: number },
    token?: string | null,
  ): Promise<{ count: number; avgHours: number; p50Hours: number; p75Hours: number; p90Hours: number }> {
    return request('/v1/analytics/cycle-time', { token, query: opts as Record<string, string | number | undefined> });
  },

  async getThroughput(
    opts?: { projectId?: string; days?: number },
    token?: string | null,
  ): Promise<{ buckets: Array<{ weekStart: string; count: number }> }> {
    return request('/v1/analytics/throughput', { token, query: opts as Record<string, string | number | undefined> });
  },

  async getVelocity(
    opts?: { projectId?: string; weeks?: number },
    token?: string | null,
  ): Promise<{ buckets: Array<{ weekStart: string; completed: number }> }> {
    return request('/v1/analytics/velocity', { token, query: opts as Record<string, string | number | undefined> });
  },

  async getBurndown(
    projectId: string,
    token?: string | null,
  ): Promise<{ buckets: Array<{ date: string; total: number; completed: number; remaining: number }> }> {
    return request('/v1/analytics/burndown', { token, query: { projectId } });
  },

  async getLoadByAssignee(
    token?: string | null,
  ): Promise<{ assignees: Array<{ assigneeId: string; displayName: string | null; email: string; openCount: number }> }> {
    return request('/v1/analytics/load-by-assignee', { token });
  },

  // Project updates (XP-21)
  async listProjectUpdates(projectId: string, token?: string | null): Promise<{ updates: ProjectUpdate[] }> {
    return request('/v1/project-updates', { token, query: { projectId } });
  },

  async createProjectUpdate(
    input: { projectId: string; body: string; health?: ProjectUpdateHealth },
    token?: string | null,
  ): Promise<{ update: ProjectUpdate }> {
    return request('/v1/project-updates', { method: 'POST', body: input, token });
  },

  async deleteProjectUpdate(id: string, token?: string | null): Promise<void> {
    await request(`/v1/project-updates/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  // Docs
  async listDocs(
    opts?: { projectId?: string },
    token?: string | null,
  ): Promise<{ docs: Doc[] }> {
    return request('/v1/docs', { token, query: opts as Record<string, string | number | undefined> });
  },

  async getDoc(id: string, token?: string | null): Promise<{ doc: Doc }> {
    return request(`/v1/docs/${encodeURIComponent(id)}`, { token });
  },

  async createDoc(
    input: { title: string; content?: string; projectId?: string; parentId?: string | null },
    token?: string | null,
  ): Promise<{ doc: Doc }> {
    return request('/v1/docs', { method: 'POST', body: input, token });
  },

  async updateDoc(
    id: string,
    input: { title?: string; content?: string; parentId?: string | null },
    token?: string | null,
  ): Promise<{ doc: Doc }> {
    return request(`/v1/docs/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, token });
  },

  async deleteDoc(id: string, token?: string | null): Promise<void> {
    await request(`/v1/docs/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  },

  async listDocRevisions(
    docId: string,
    token?: string | null,
  ): Promise<{ revisions: DocRevision[] }> {
    return request(`/v1/docs/${encodeURIComponent(docId)}/revisions`, { token });
  },

  // Jira import
  async getJiraProjects(
    input: { jiraUrl: string; email: string; apiToken: string },
    token?: string | null,
  ): Promise<{ projects: Array<{ id: string; key: string; name: string; type: string }> }> {
    return request('/v1/imports/jira/projects', { method: 'POST', body: input, token });
  },

  async startJiraImport(
    input: {
      jiraUrl: string;
      email: string;
      apiToken: string;
      jiraProjectKey: string;
      projectId: string;
    },
    token?: string | null,
  ): Promise<{
    id: string;
    projectId: string;
    status: string;
    filename: string;
    totalRows: number;
    importedRows: number;
    failedRows: number;
    errors: Array<{ row: number; message: string }>;
    createdAt: string;
    completedAt: string | null;
  }> {
    return request('/v1/imports/jira', { method: 'POST', body: input, token });
  },

  // GitHub import
  async getGithubRepo(
    input: { repo: string; token: string },
    sessionToken?: string | null,
  ): Promise<{ repo: { fullName: string; openIssues: number } }> {
    return request('/v1/imports/github/repo', { method: 'POST', body: input, token: sessionToken });
  },

  async startGithubImport(
    input: { repo: string; token: string; projectId: string },
    sessionToken?: string | null,
  ): Promise<ImportJob> {
    return request('/v1/imports/github', { method: 'POST', body: input, token: sessionToken });
  },
};
