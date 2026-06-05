import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getIssueByKey,
  listIssues,
  createIssue,
  updateIssue,
  bulkUpdateIssues,
  softDeleteIssue,
  createComment,
  listCommentsForIssue,
  listLabels,
  createLabel,
  attachLabelToIssue,
  detachLabelFromIssue,
  labelsForIssues,
  listWorkflowStates,
  listProjects,
  createProject,
  listTeams,
  listWorkspaceUsers,
  addIssueAssignee,
  removeIssueAssignee,
  notifications,
  touchUserSeen,
  harnessKeys,
  docs,
} from '@xpntl/domain';
import type { FullAuthContext, IssueRow } from '@xpntl/domain';

// Canonical web base for deep links handed back to agents (issue URLs).
const WEB_BASE = process.env.APP_URL ?? process.env.PUBLIC_WEB_URL ?? 'https://app.xpntl.dev';

// Presence (XP-11): stamp the agent's last-active time on tool use, throttled.
const SEEN_INTERVAL_MS = 60 * 1000;
const seenAt = new Map<string, number>();
function bumpSeen(ctx: FullAuthContext): void {
  const now = Date.now();
  if (now - (seenAt.get(ctx.user.id) ?? 0) < SEEN_INTERVAL_MS) return;
  seenAt.set(ctx.user.id, now);
  touchUserSeen(ctx.workspace.id, ctx.user.id).catch(() => {});
}

export function buildServer(): {
  server: McpServer;
  getAuthCtx: () => FullAuthContext;
  setAuthCtx: (ctx: FullAuthContext) => void;
} {
  const server = new McpServer({
    name: 'xpntl',
    version: '0.1.0',
  });

  let authCtx: FullAuthContext | null = null;

  function assertAuth(): FullAuthContext {
    if (!authCtx) {
      throw new Error('Not authenticated. Call xpntl_authenticate first with your harness key.');
    }
    bumpSeen(authCtx);
    return authCtx;
  }

  // ── Auth ────────────────────────────────────────────────────

  server.tool(
    'xpntl_authenticate',
    'Authenticate with an xpntl coding harness key. Must be called before any other tool.',
    { key: z.string().describe('Your xpntl harness key (xpntl_hk_...)') },
    async ({ key }) => {
      const resolved = await harnessKeys.resolveHarnessKeyContext(key);
      if (!resolved) {
        return { content: [{ type: 'text' as const, text: 'Invalid or revoked harness key.' }] };
      }
      authCtx = resolved;

      const ctx = authCtx;
      const name = ctx.user.display_name ?? ctx.user.email;
      return {
        content: [{
          type: 'text' as const,
          text: `Authenticated as ${name} in workspace ${ctx.workspace.name} (${ctx.workspace.key})`,
        }],
      };
    },
  );

  // ── Issues ──────────────────────────────────────────────────

  server.tool(
    'xpntl_issue_list',
    'List/search issues. Supports full-text search, filtering by state type, priority, and assignee.',
    {
      q: z.string().optional().describe('Full-text search across key, title, description'),
      stateType: z.enum(['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled']).optional().describe('Filter by workflow state type'),
      priority: z.number().min(0).max(4).optional().describe('Filter by priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
      assigneeId: z.string().optional().describe('Filter by assignee user ID'),
      includeSubIssues: z.boolean().optional().describe('Include sub-issues (default false)'),
      limit: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const ctx = assertAuth();
      const filter: Record<string, unknown> = {};
      if (params.q) filter.q = params.q;
      if (params.stateType) filter.stateTypes = [params.stateType];
      if (params.priority !== undefined) filter.priorities = [params.priority];
      if (params.assigneeId) filter.assigneeIds = [params.assigneeId];
      if (params.includeSubIssues) filter.rootOnly = false;

      const issues = await listIssues({
        ctx,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        limit: params.limit ?? 50,
      });

      const states = await listWorkflowStates(ctx);
      const stateMap = new Map(states.map((s) => [s.id, s]));

      const result = issues.map((i) => ({
        key: i.key,
        title: i.title,
        state: stateMap.get(i.state_id)?.name ?? i.state_id,
        stateType: stateMap.get(i.state_id)?.type ?? 'unknown',
        priority: i.priority,
        type: i.type,
        blocked: i.blocked,
        assigneeId: i.assignee_id,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'xpntl_issue_get',
    'Get a single issue by key (e.g. "ACME-42").',
    { key: z.string().describe('Issue key like ACME-42') },
    async ({ key }) => {
      const ctx = assertAuth();
      const issue = await getIssueByKey(ctx, key);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            key: issue.key,
            title: issue.title,
            description: issue.description,
            stateId: issue.state_id,
            priority: issue.priority,
            type: issue.type,
            blocked: issue.blocked,
            assigneeId: issue.assignee_id,
            creatorId: issue.creator_id,
            projectId: issue.project_id,
            teamId: issue.team_id,
            startDate: issue.start_date,
            dueDate: issue.due_date,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'xpntl_issue_create',
    'Create a new issue. Use xpntl_workflow_state_list to find valid stateId values, xpntl_user_list for assigneeIds.',
    {
      title: z.string().describe('Issue title'),
      description: z.string().optional().describe('Issue description (markdown)'),
      priority: z.number().min(0).max(4).optional().describe('Priority 0-4 (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
      type: z.string().optional().describe('Issue type: issue, task, bug, feature, epic, story, research'),
      stateId: z.string().optional().describe('Workflow state ID'),
      assigneeId: z.string().optional().describe('Assignee user ID'),
      projectId: z.string().optional().describe('Project ID (defaults to last-used or first project in workspace)'),
      labelIds: z.array(z.string()).optional().describe('Label IDs to attach'),
      parentKey: z.string().optional().describe('Parent issue key for sub-issues (e.g. ACME-1)'),
    },
    async (params) => {
      const ctx = assertAuth();
      let parentId: string | undefined;
      if (params.parentKey) {
        const parent = await getIssueByKey(ctx, params.parentKey);
        parentId = parent.id;
      }
      const issue = await createIssue({
        ctx,
        title: params.title,
        description: params.description,
        priority: params.priority,
        type: params.type,
        stateId: params.stateId,
        assigneeId: params.assigneeId,
        projectId: params.projectId,
        parentId,
      });
      if (params.labelIds?.length) {
        for (const labelId of params.labelIds) {
          await attachLabelToIssue({ ctx, issueId: issue.id, labelId });
        }
      }
      return {
        content: [{ type: 'text' as const, text: `Created issue ${issue.key}: ${issue.title}` }],
      };
    },
  );

  server.tool(
    'xpntl_issue_update',
    'Update an existing issue by key.',
    {
      key: z.string().describe('Issue key like ACME-42'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      priority: z.number().min(0).max(4).optional().describe('New priority'),
      type: z.string().optional().describe('Issue type: issue, task, bug, feature, epic, story, research'),
      blocked: z.boolean().optional().describe('Whether the issue is blocked (red border on the board)'),
      stateId: z.string().optional().describe('New workflow state ID'),
      assigneeId: z.string().nullable().optional().describe('New assignee (null to unassign)'),
    },
    async ({ key, ...patch }) => {
      const ctx = assertAuth();
      const issue = await updateIssue({ ctx, key, patch });
      return {
        content: [{ type: 'text' as const, text: `Updated ${issue.key}: ${issue.title}` }],
      };
    },
  );

  // ── Comments ────────────────────────────────────────────────

  server.tool(
    'xpntl_comment_list',
    'List comments on an issue.',
    { key: z.string().describe('Issue key like ACME-42') },
    async ({ key }) => {
      const ctx = assertAuth();
      const comments = await listCommentsForIssue(ctx, key);
      const result = comments.map((c) => ({
        id: c.id,
        authorId: c.author_id,
        body: c.body,
        createdAt: c.created_at,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'xpntl_comment_create',
    'Post a comment on an issue. Use this to provide status updates, ask questions, or report results.',
    {
      key: z.string().describe('Issue key like ACME-42'),
      body: z.string().describe('Comment body (markdown supported)'),
    },
    async ({ key, body }) => {
      const ctx = assertAuth();
      const comment = await createComment({ ctx, issueKey: key, body });
      return {
        content: [{ type: 'text' as const, text: `Comment posted on ${key} (id: ${comment.id})` }],
      };
    },
  );

  // ── Notifications (XP-12: lets an agent see what it's been @mentioned on) ──

  // XP-104: one-call actionable inbox. The plain notification_list returns bare
  // rows, so picking up an @mention used to take ~50 follow-up calls (resolve the
  // issue, fetch its comments, find the mention, look up who sent it). This pulls
  // all of that together — issue context + the comment/mention text + actor — so
  // an agent can read its inbox, act, and reply with no intermediate lookups.
  server.tool(
    'xpntl_inbox',
    'Your actionable inbox in ONE call: unread @mentions, assignments, and comment replies — each already enriched with the issue (key, title, state, priority, URL), the @mention/comment text, and who triggered it, so you can act and reply with no follow-up lookups. Reply with xpntl_comment_create, then clear each item with xpntl_notification_mark_read. Poll this when you want to pick up board work without leaving your session.',
    {
      types: z
        .array(z.enum(['mention', 'assigned', 'comment', 'state_change', 'due_soon']))
        .optional()
        .describe('Notification types to include. Default: mention, assigned, comment (the actionable ones).'),
      includeRead: z
        .boolean()
        .optional()
        .describe('Include already-read items too (default false — unread only).'),
      limit: z.number().int().min(1).max(100).optional().describe('Max items to return (default 30).'),
    },
    async ({ types, includeRead, limit }) => {
      const ctx = assertAuth();
      const wanted = new Set(types ?? ['mention', 'assigned', 'comment']);
      const max = limit ?? 30;

      // Pull a generous window then filter by type in app code; listNotifications
      // already LEFT JOINs the issue key (and excludes archived by default).
      const raw = await notifications.listNotifications(ctx, { unread: !includeRead, limit: 100 });
      const matched = raw.filter((n) => wanted.has(n.type)).slice(0, max);

      // Enrich once per distinct issue — fetch the issue, and (only when a
      // notification points at a comment) that issue's comments, indexed by id.
      const issueKeys = [
        ...new Set(matched.map((n) => n.issue_key).filter((k): k is string => Boolean(k))),
      ];
      const needComments = new Set(
        matched.filter((n) => n.comment_id && n.issue_key).map((n) => n.issue_key as string),
      );

      const [states, { users }] = await Promise.all([
        listWorkflowStates(ctx),
        listWorkspaceUsers(ctx),
      ]);
      const stateName = new Map(states.map((s) => [s.id, s.name]));
      const userName = new Map(users.map((u) => [u.id, u.display_name ?? u.email]));

      const issueByKey = new Map<string, IssueRow>();
      const commentBody = new Map<string, string>();
      await Promise.all(
        issueKeys.map(async (key) => {
          try {
            issueByKey.set(key, await getIssueByKey(ctx, key));
          } catch {
            // Issue may have been deleted since the notification fired — skip enrichment.
          }
          if (needComments.has(key)) {
            try {
              for (const c of await listCommentsForIssue(ctx, key)) commentBody.set(c.id, c.body);
            } catch {
              // Comments unreadable (deleted issue / perms) — leave comment text null.
            }
          }
        }),
      );

      const items = matched.map((n) => {
        const issue = n.issue_key ? issueByKey.get(n.issue_key) : undefined;
        return {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          actor: n.actor_id ? { id: n.actor_id, name: userName.get(n.actor_id) ?? null } : null,
          issue: n.issue_key
            ? {
                key: n.issue_key,
                title: issue?.title ?? null,
                state: issue ? (stateName.get(issue.state_id) ?? null) : null,
                priority: issue?.priority ?? null,
                blocked: issue?.blocked ?? null,
                assigneeId: issue?.assignee_id ?? null,
                url: `${WEB_BASE}/issues/${encodeURIComponent(n.issue_key)}`,
              }
            : null,
          comment: n.comment_id
            ? { id: n.comment_id, body: commentBody.get(n.comment_id) ?? null }
            : null,
          read: n.read_at != null,
          createdAt: n.created_at,
        };
      });

      const unreadCount = await notifications.getUnreadCount(ctx);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ unreadCount, returned: items.length, items }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'xpntl_notification_list',
    "List notifications for the authenticated user/agent — including @mentions, assignments, and comments. Poll this to pick up work you've been mentioned on, then act and mark it read.",
    {
      unreadOnly: z.boolean().optional().describe('Only return unread notifications (default false)'),
      limit: z.number().int().min(1).max(100).optional().describe('Max notifications (default 50)'),
    },
    async ({ unreadOnly, limit }) => {
      const ctx = assertAuth();
      const items = await notifications.listNotifications(ctx, { unread: unreadOnly, limit });
      const result = items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        issueKey: n.issue_key ?? null,
        issueId: n.issue_id ?? null,
        actorId: n.actor_id ?? null,
        read: n.read_at != null,
        createdAt: n.created_at,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'xpntl_notification_mark_read',
    'Mark a notification as read (e.g. after acting on an @mention) so you don’t process it again.',
    { id: z.string().describe('Notification id from xpntl_notification_list') },
    async ({ id }) => {
      const ctx = assertAuth();
      await notifications.markRead(ctx, id);
      return { content: [{ type: 'text' as const, text: `Notification ${id} marked read` }] };
    },
  );

  // ── Workflow States ────────────────────────────────────────

  server.tool(
    'xpntl_workflow_state_list',
    'List all workflow states in the workspace. Use these IDs when creating/updating issues.',
    {},
    async () => {
      const ctx = assertAuth();
      const states = await listWorkflowStates(ctx);
      const result = states.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        position: s.position,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Labels ─────────────────────────────────────────────────

  server.tool(
    'xpntl_label_list',
    'List all labels in the workspace.',
    {},
    async () => {
      const ctx = assertAuth();
      const labels = await listLabels(ctx);
      const result = labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'xpntl_label_create',
    'Create a new label.',
    {
      name: z.string().describe('Label name'),
      color: z.string().optional().describe('Hex color (e.g. #ff0000)'),
      description: z.string().optional().describe('Label description'),
    },
    async (params) => {
      const ctx = assertAuth();
      const label = await createLabel({ ctx, name: params.name, color: params.color, description: params.description });
      return { content: [{ type: 'text' as const, text: `Created label "${label.name}" (${label.id})` }] };
    },
  );

  server.tool(
    'xpntl_label_add',
    'Add a label to an issue.',
    {
      key: z.string().describe('Issue key like ACME-42'),
      labelId: z.string().describe('Label ID'),
    },
    async ({ key, labelId }) => {
      const ctx = assertAuth();
      const issue = await getIssueByKey(ctx, key);
      await attachLabelToIssue({ ctx, issueId: issue.id, labelId });
      return { content: [{ type: 'text' as const, text: `Added label to ${key}` }] };
    },
  );

  server.tool(
    'xpntl_label_remove',
    'Remove a label from an issue.',
    {
      key: z.string().describe('Issue key like ACME-42'),
      labelId: z.string().describe('Label ID'),
    },
    async ({ key, labelId }) => {
      const ctx = assertAuth();
      const issue = await getIssueByKey(ctx, key);
      await detachLabelFromIssue({ ctx, issueId: issue.id, labelId });
      return { content: [{ type: 'text' as const, text: `Removed label from ${key}` }] };
    },
  );

  // ── Projects ───────────────────────────────────────────────

  server.tool(
    'xpntl_project_list',
    'List all projects in the workspace.',
    {},
    async () => {
      const ctx = assertAuth();
      const projects = await listProjects(ctx);
      const result = projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        description: p.description,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'xpntl_project_create',
    'Create a new project.',
    {
      name: z.string().describe('Project name'),
      key: z.string().describe('Project key prefix (2-10 uppercase chars, e.g. FRONTEND)'),
      description: z.string().optional().describe('Project description'),
    },
    async (params) => {
      const ctx = assertAuth();
      const project = await createProject({ ctx, name: params.name, key: params.key, description: params.description });
      return { content: [{ type: 'text' as const, text: `Created project "${project.name}" (${project.id})` }] };
    },
  );

  // ── Docs ───────────────────────────────────────────────────
  // Workspace docs are the nestable wiki pages (XP-89) shown under Docs in the
  // web app. These mirror the REST surface (list/get/create/update/delete) so an
  // agent can read and maintain a workspace's knowledge base — specs, runbooks,
  // ADRs — the same way it manages issues. Docs are markdown; list returns
  // metadata only (no content) to stay lean — fetch a doc to read its body.

  server.tool(
    'xpntl_doc_list',
    'List workspace docs (the nestable wiki pages). Returns metadata only — id, title, projectId, parentId, updatedAt — not the body. Use xpntl_doc_get to read a doc. parentId lets you reconstruct the page tree.',
    {
      projectId: z.string().optional().describe('Only return docs scoped to this project'),
    },
    async ({ projectId }) => {
      const ctx = assertAuth();
      const rows = await docs.listDocs(ctx, projectId ? { projectId } : undefined);
      const result = rows.map((d) => ({
        id: d.id,
        title: d.title,
        projectId: d.project_id,
        parentId: d.parent_id,
        updatedAt: d.updated_at,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'xpntl_doc_get',
    'Get a single workspace doc by id, including its full markdown content. Get the id from xpntl_doc_list.',
    { id: z.string().describe('Doc id from xpntl_doc_list') },
    async ({ id }) => {
      const ctx = assertAuth();
      const doc = await docs.getDoc(ctx, id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            projectId: doc.project_id,
            parentId: doc.parent_id,
            createdBy: doc.created_by,
            updatedBy: doc.updated_by,
            createdAt: doc.created_at,
            updatedAt: doc.updated_at,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'xpntl_doc_create',
    'Create a new workspace doc (markdown). Optionally scope it to a project or nest it under a parent doc.',
    {
      title: z.string().describe('Doc title'),
      content: z.string().optional().describe('Doc body (markdown)'),
      projectId: z.string().optional().describe('Project ID to scope the doc to'),
      parentId: z.string().optional().describe('Parent doc id to nest this page under'),
    },
    async (params) => {
      const ctx = assertAuth();
      const doc = await docs.createDoc(ctx, {
        title: params.title,
        content: params.content,
        projectId: params.projectId,
        parentId: params.parentId,
      });
      return { content: [{ type: 'text' as const, text: `Created doc "${doc.title}" (${doc.id})` }] };
    },
  );

  server.tool(
    'xpntl_doc_update',
    'Update a workspace doc by id. Editing content saves the previous version as a revision. Pass parentId to move the page in the tree.',
    {
      id: z.string().describe('Doc id from xpntl_doc_list'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New body (markdown) — full replacement'),
      parentId: z.string().nullable().optional().describe('New parent doc id (null to move to the root)'),
    },
    async ({ id, ...patch }) => {
      const ctx = assertAuth();
      const doc = await docs.updateDoc(ctx, id, patch);
      return { content: [{ type: 'text' as const, text: `Updated doc "${doc.title}" (${doc.id})` }] };
    },
  );

  server.tool(
    'xpntl_doc_delete',
    'Delete a workspace doc by id (admin only). Any sub-pages are re-homed under the deleted doc’s parent rather than orphaned.',
    { id: z.string().describe('Doc id from xpntl_doc_list') },
    async ({ id }) => {
      const ctx = assertAuth();
      await docs.deleteDoc(ctx, id);
      return { content: [{ type: 'text' as const, text: `Deleted doc ${id}` }] };
    },
  );

  // ── Teams ──────────────────────────────────────────────────

  server.tool(
    'xpntl_team_list',
    'List all teams in the workspace.',
    {},
    async () => {
      const ctx = assertAuth();
      const teams = await listTeams(ctx);
      const result = teams.map((t) => ({
        id: t.id,
        name: t.name,
        key: t.key,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Users ──────────────────────────────────────────────────

  server.tool(
    'xpntl_user_list',
    'List workspace members. Use these IDs when assigning issues.',
    {},
    async () => {
      const ctx = assertAuth();
      const { users } = await listWorkspaceUsers(ctx);
      const result = users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        role: u.role,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Assignees ──────────────────────────────────────────────

  server.tool(
    'xpntl_issue_assign',
    'Assign a user to an issue.',
    {
      key: z.string().describe('Issue key like ACME-42'),
      userId: z.string().describe('User ID to assign'),
    },
    async ({ key, userId }) => {
      const ctx = assertAuth();
      const issue = await getIssueByKey(ctx, key);
      await addIssueAssignee({ ctx, issueId: issue.id, userId });
      return { content: [{ type: 'text' as const, text: `Assigned user to ${key}` }] };
    },
  );

  server.tool(
    'xpntl_issue_unassign',
    'Remove a user from an issue.',
    {
      key: z.string().describe('Issue key like ACME-42'),
      userId: z.string().describe('User ID to unassign'),
    },
    async ({ key, userId }) => {
      const ctx = assertAuth();
      const issue = await getIssueByKey(ctx, key);
      await removeIssueAssignee({ ctx, issueId: issue.id, userId });
      return { content: [{ type: 'text' as const, text: `Unassigned user from ${key}` }] };
    },
  );

  // ── Bulk Operations ────────────────────────────────────────

  server.tool(
    'xpntl_issue_bulk_update',
    'Update multiple issues at once (e.g. move several issues to a state, change priority).',
    {
      keys: z.array(z.string()).describe('Issue keys to update'),
      stateId: z.string().optional().describe('New workflow state ID'),
      priority: z.number().min(0).max(4).optional().describe('New priority'),
      assigneeId: z.string().nullable().optional().describe('New assignee (null to unassign)'),
    },
    async ({ keys, ...patch }) => {
      const ctx = assertAuth();
      const issues = await bulkUpdateIssues({ ctx, keys, patch });
      return { content: [{ type: 'text' as const, text: `Updated ${issues.length} issues: ${issues.map((i) => i.key).join(', ')}` }] };
    },
  );

  server.tool(
    'xpntl_issue_delete',
    'Soft-delete an issue (can be restored later).',
    { key: z.string().describe('Issue key like ACME-42') },
    async ({ key }) => {
      const ctx = assertAuth();
      await softDeleteIssue(ctx, key);
      return { content: [{ type: 'text' as const, text: `Deleted ${key}` }] };
    },
  );

  return {
    server,
    getAuthCtx: () => assertAuth(),
    // Lets the HTTP transport pre-authenticate a session from an
    // `Authorization: Bearer xpntl_hk_...` header, so standard MCP clients
    // (Claude Code, Codex, claude.ai connectors) work without an explicit
    // xpntl_authenticate tool call. The in-band tool remains as a fallback.
    setAuthCtx: (ctx: FullAuthContext) => {
      authCtx = ctx;
    },
  };
}

/** Pull a harness key out of an `Authorization: Bearer xpntl_hk_...` header. */
export function harnessKeyFromHeader(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = m?.[1]?.trim();
  return token && token.startsWith('xpntl_hk_') ? token : null;
}
