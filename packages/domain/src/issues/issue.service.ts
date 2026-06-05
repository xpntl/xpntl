import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { evaluateAutomations } from '../automations/automation.executor.js';
import { canCreateIssue, canUpdateIssue } from '../authz.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { notifyQuietly } from '../notifications/notification.service.js';
import { writeOp } from '../sync/op-log.service.js';
import type { FullAuthContext, IssueKeyAliasRow, IssueRow, ProjectRow, UserRow, WorkflowStateRow } from '../types.js';
import { dispatchWebhookEvent } from '../webhooks/webhook.service.js';
import { type IssueFilter, type IssueSort, compileIssueFilter } from './issue-filter.js';
import { isValidIssueType } from './issue-types.js';
import { logActivityOnClient } from './issue-activity.service.js';

export type CreateIssueInput = {
  ctx: FullAuthContext;
  title: string;
  description?: string;
  priority?: number;
  type?: string;
  stateId?: string;
  assigneeId?: string;
  projectId?: string;
  parentId?: string;
};

export async function createIssue(input: CreateIssueInput): Promise<IssueRow> {
  if (!canCreateIssue(input.ctx)) {
    throw new ForbiddenError('You do not have permission to create issues');
  }

  const title = input.title.trim();
  if (title.length < 1 || title.length > 500) {
    throw new ValidationError('title must be 1-500 characters');
  }

  if (input.type !== undefined && !isValidIssueType(input.type)) {
    throw new ValidationError('invalid issue type');
  }
  const issueType = input.type ?? 'issue';

  const parentId = input.parentId ?? null;

  const txResult = await withTransaction(async (client) => {
    if (parentId) {
      const parentResult = await tenantClientQuery<IssueRow>(
        client,
        input.ctx.workspace.id,
        `SELECT id FROM issues WHERE {TENANT} AND id = $1`,
        [parentId],
      );
      if (parentResult.rows.length === 0) {
        throw new ValidationError(`parentId ${parentId} not found in workspace`);
      }
    }

    // 1. Resolve state: use provided stateId if valid, else pick default.
    const stateResult = await tenantClientQuery<WorkflowStateRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM workflow_states WHERE {TENANT} ORDER BY position ASC`,
    );
    let state: WorkflowStateRow | undefined;
    if (input.stateId) {
      state = stateResult.rows.find((s) => s.id === input.stateId);
      if (!state) throw new ValidationError(`stateId ${input.stateId} not found in workspace`);
    } else {
      state =
        stateResult.rows.find((s) => s.type === 'unstarted') ??
        stateResult.rows.find((s) => s.type === 'backlog') ??
        stateResult.rows[0];
    }
    if (!state) {
      throw new Error('Workspace has no workflow states; data is inconsistent');
    }

    const assigneeId = input.assigneeId ?? null;

    let projectId = input.projectId;
    if (!projectId) {
      const lastUsed = await getLastUsedProjectId(input.ctx);
      if (lastUsed) {
        projectId = lastUsed;
      } else {
        const firstProject = await tenantClientQuery<ProjectRow>(
          client,
          input.ctx.workspace.id,
          `SELECT id FROM projects WHERE {TENANT} ORDER BY created_at ASC LIMIT 1`,
        );
        if (!firstProject.rows[0]) throw new ValidationError('Workspace has no projects');
        projectId = firstProject.rows[0].id;
      }
    }

    // 2a. Look up the project to get its key prefix.
    const projectResult = await tenantClientQuery<ProjectRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM projects WHERE {TENANT} AND id = $1`,
      [projectId],
    );
    const project = projectResult.rows[0];
    if (!project) {
      throw new ValidationError(`projectId ${projectId} not found in workspace`);
    }

    // 2b. Bump the per-project key counter and read the new value.
    const counterResult = await client.query<{ last_key: number }>(
      `INSERT INTO project_key_counters (project_id, last_key)
       VALUES ($1, 1)
       ON CONFLICT (project_id)
       DO UPDATE SET last_key = project_key_counters.last_key + 1
       RETURNING last_key`,
      [projectId],
    );
    const counter = counterResult.rows[0];
    if (!counter) {
      throw new Error('Failed to allocate issue key counter for project');
    }
    const key = `${project.key}-${counter.last_key}`;

    // 2c. Record last-used project for this user.
    await client.query(
      `INSERT INTO user_project_preferences (user_id, workspace_id, last_used_project_id, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, workspace_id)
       DO UPDATE SET last_used_project_id = $3, updated_at = now()`,
      [input.ctx.user.id, input.ctx.workspace.id, projectId],
    );

    // 3. Insert.
    const issueResult = await client.query<IssueRow>(
      `INSERT INTO issues
         (id, workspace_id, key, title, description, state_id, priority, creator_id, assignee_id, project_id, parent_id, type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, extract(epoch FROM now()))
       RETURNING *`,
      [
        newId(),
        input.ctx.workspace.id,
        key,
        title,
        input.description?.trim() || null,
        state.id,
        input.priority ?? 0,
        input.ctx.user.id,
        assigneeId,
        projectId,
        parentId,
        issueType,
      ],
    );
    const issue = issueResult.rows[0];
    if (!issue) throw new Error('Failed to create issue');

    // 4. Audit.
    await recordOnClient(client, {
      workspaceId: input.ctx.workspace.id,
      actorUserId: input.ctx.user.id,
      eventType: 'issue.created',
      targetType: 'issue',
      targetId: issue.id,
      metadata: { key: issue.key, stateId: state.id },
    });

    // Real-time fan-out (XP-3) — same transaction as the insert.
    await writeOp(client, {
      workspaceId: input.ctx.workspace.id,
      actorId: input.ctx.user.id,
      entityType: 'issue',
      entityId: issue.id,
      mutation: 'create',
    });

    return { issue, stateType: state.type as string };
  });

  // Fire-and-forget automation evaluation after the transaction commits.
  evaluateAutomations(input.ctx, {
    type: 'issue_created',
    issueId: txResult.issue.id,
    issueKey: txResult.issue.key,
    stateType: txResult.stateType,
  }).catch(() => {});

  dispatchWebhookEvent(input.ctx.workspace.id, 'issue.created', {
    issue: { id: txResult.issue.id, key: txResult.issue.key, title: txResult.issue.title },
    actor: { id: input.ctx.user.id, email: input.ctx.user.email },
  }).catch(() => {});

  return txResult.issue;
}

export type ListIssuesInput = {
  ctx: FullAuthContext;
  filter?: IssueFilter;
  sort?: IssueSort;
  limit?: number;
};

export async function listIssues(input: ListIssuesInput | FullAuthContext): Promise<IssueRow[]> {
  // Backwards-compatible: callers passing the bare FullAuthContext still work.
  const opts: ListIssuesInput = 'ctx' in input ? input : { ctx: input };

  const filter = opts.filter ?? {};
  const sort = opts.sort ?? 'manual';
  const limit = Math.min(opts.limit ?? 200, 500);

  const compiled = compileIssueFilter(filter, sort);
  const sql = `SELECT * FROM issues
                WHERE {TENANT}${compiled.whereSql}
                ORDER BY ${compiled.orderBySql}
                LIMIT ${limit}`;
  const { rows } = await tenantPoolQuery<IssueRow>(opts.ctx.workspace.id, sql, compiled.params);
  return rows;
}

export async function getIssueByKey(ctx: FullAuthContext, key: string): Promise<IssueRow> {
  // First try direct key lookup.
  const { rows } = await tenantPoolQuery<IssueRow>(
    ctx.workspace.id,
    `SELECT * FROM issues WHERE {TENANT} AND key = $1 AND deleted_at IS NULL`,
    [key],
  );
  if (rows[0]) return rows[0];

  // Fall back to alias lookup (for issues that were moved between projects).
  const aliasResult = await tenantPoolQuery<IssueKeyAliasRow>(
    ctx.workspace.id,
    `SELECT * FROM issue_key_aliases WHERE {TENANT} AND old_key = $1`,
    [key],
  );
  const alias = aliasResult.rows[0];
  if (alias) {
    const issueResult = await tenantPoolQuery<IssueRow>(
      ctx.workspace.id,
      `SELECT * FROM issues WHERE {TENANT} AND id = $1 AND deleted_at IS NULL`,
      [alias.issue_id],
    );
    if (issueResult.rows[0]) return issueResult.rows[0];
  }

  throw new NotFoundError(`Issue ${key} not found`);
}

export type IssuePatch = {
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
};

/**
 * Apply a partial update to an issue. Validates each provided field against
 * the workspace; writes one row and one audit entry per changed field.
 *
 * Used by PATCH /v1/issues/:key. Frontend consumers: state pill in slide-over
 * peek, inline-edit popovers (PER-108), bulk multi-select toolbar (PER-109).
 */
export async function updateIssue(input: {
  ctx: FullAuthContext;
  key: string;
  patch: IssuePatch;
}): Promise<IssueRow> {
  const { ctx, key, patch } = input;

  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to update issues');
  }

  const hasAny =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.stateId !== undefined ||
    patch.priority !== undefined ||
    patch.type !== undefined ||
    patch.blocked !== undefined ||
    patch.assigneeId !== undefined ||
    patch.parentId !== undefined ||
    patch.listId !== undefined ||
    patch.milestoneId !== undefined ||
    patch.coverBlobRef !== undefined ||
    patch.coverPosition !== undefined ||
    patch.startDate !== undefined ||
    patch.dueDate !== undefined ||
    patch.sortOrder !== undefined;
  if (!hasAny) {
    throw new ValidationError('patch must include at least one field');
  }

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 1 || t.length > 500) {
      throw new ValidationError('title must be 1-500 characters');
    }
  }
  if (patch.description !== undefined && patch.description !== null) {
    if (patch.description.length > 50_000) {
      throw new ValidationError('description exceeds 50,000 characters');
    }
  }
  if (patch.priority !== undefined) {
    if (!Number.isInteger(patch.priority) || patch.priority < 0 || patch.priority > 4) {
      throw new ValidationError('priority must be an integer 0..4');
    }
  }
  if (patch.type !== undefined && !isValidIssueType(patch.type)) {
    throw new ValidationError('invalid issue type');
  }

  const result = await withTransaction(async (client) => {
    const currentResult = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM issues WHERE {TENANT} AND key = $1 FOR UPDATE`,
      [key],
    );
    const current = currentResult.rows[0];
    if (!current) throw new NotFoundError(`Issue ${key} not found`);

    if (patch.stateId !== undefined) {
      const stateExists = await tenantClientQuery<WorkflowStateRow>(
        client,
        ctx.workspace.id,
        `SELECT id FROM workflow_states WHERE {TENANT} AND id = $1`,
        [patch.stateId],
      );
      if (stateExists.rows.length === 0) {
        throw new ValidationError(`stateId ${patch.stateId} not found in workspace`);
      }
    }

    if (patch.assigneeId !== undefined && patch.assigneeId !== null) {
      const userExists = await tenantClientQuery<UserRow>(
        client,
        ctx.workspace.id,
        `SELECT id FROM users WHERE {TENANT} AND id = $1`,
        [patch.assigneeId],
      );
      if (userExists.rows.length === 0) {
        throw new ValidationError(`assigneeId ${patch.assigneeId} is not a workspace member`);
      }
    }

    if (patch.listId !== undefined && patch.listId !== null) {
      const listExists = await tenantClientQuery<{ id: string; project_id: string }>(
        client,
        ctx.workspace.id,
        `SELECT id, project_id FROM project_lists WHERE {TENANT} AND id = $1`,
        [patch.listId],
      );
      if (listExists.rows.length === 0) {
        throw new ValidationError(`listId ${patch.listId} not found in workspace`);
      }
      // A list belongs to a project; the issue must be in that same project.
      if (listExists.rows[0]!.project_id !== current.project_id) {
        throw new ValidationError('listId belongs to a different project than the issue');
      }
    }

    if (patch.parentId !== undefined && patch.parentId !== null) {
      if (patch.parentId === current.id) {
        throw new ValidationError('An issue cannot be its own parent');
      }
      const parentExists = await tenantClientQuery<IssueRow>(
        client,
        ctx.workspace.id,
        `SELECT id, parent_id FROM issues WHERE {TENANT} AND id = $1`,
        [patch.parentId],
      );
      if (parentExists.rows.length === 0) {
        throw new ValidationError(`parentId ${patch.parentId} not found in workspace`);
      }
      if (parentExists.rows[0]!.parent_id === current.id) {
        throw new ValidationError('Circular parent-child relationship detected');
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const trackChanges: Array<{ field: string; old: unknown; new: unknown }> = [];

    const stage = (field: string, column: string, value: unknown, current_value: unknown) => {
      if (value === current_value) return;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
      trackChanges.push({ field, old: current_value, new: value });
    };

    if (patch.title !== undefined) stage('title', 'title', patch.title.trim(), current.title);
    if (patch.description !== undefined) {
      const next = patch.description === null ? null : patch.description.trim() || null;
      stage('description', 'description', next, current.description);
    }
    if (patch.stateId !== undefined) stage('stateId', 'state_id', patch.stateId, current.state_id);
    if (patch.priority !== undefined)
      stage('priority', 'priority', patch.priority, current.priority);
    if (patch.type !== undefined) stage('type', 'type', patch.type, current.type);
    if (patch.blocked !== undefined)
      stage('blocked', 'blocked', patch.blocked, current.blocked);
    if (patch.assigneeId !== undefined)
      stage('assigneeId', 'assignee_id', patch.assigneeId, current.assignee_id);
    if (patch.parentId !== undefined)
      stage('parentId', 'parent_id', patch.parentId, current.parent_id);
    if (patch.listId !== undefined)
      stage('listId', 'list_id', patch.listId, current.list_id);
    if (patch.milestoneId !== undefined)
      stage('milestoneId', 'milestone_id', patch.milestoneId, current.milestone_id);
    if (patch.coverBlobRef !== undefined)
      stage('coverBlobRef', 'cover_blob_ref', patch.coverBlobRef, current.cover_blob_ref);
    if (patch.coverPosition !== undefined)
      stage('coverPosition', 'cover_position', patch.coverPosition, current.cover_position);
    if (patch.startDate !== undefined) {
      const v = patch.startDate ? new Date(patch.startDate) : null;
      stage('startDate', 'start_date', v, current.start_date);
    }
    if (patch.dueDate !== undefined) {
      const v = patch.dueDate ? new Date(patch.dueDate) : null;
      stage('dueDate', 'due_date', v, current.due_date);
    }
    if (patch.sortOrder !== undefined)
      stage('sortOrder', 'sort_order', patch.sortOrder, current.sort_order);

    if (sets.length === 0) {
      return { updated: current, stateChangeInfo: null };
    }

    sets.push(`updated_at = now()`);
    params.push(ctx.workspace.id);
    params.push(key);

    const sql = `
      UPDATE issues
         SET ${sets.join(', ')}
       WHERE workspace_id = $${params.length - 1}
         AND key = $${params.length}
       RETURNING *
    `;
    const updateResult = await client.query<IssueRow>(sql, params);
    const updated = updateResult.rows[0];
    if (!updated) throw new Error('Failed to update issue');

    // Real-time fan-out (XP-3) — same transaction as the update.
    await writeOp(client, {
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      entityType: 'issue',
      entityId: updated.id,
      mutation: 'update',
    });

    // Track whether the state changed so we can fire automations after commit.
    let stateChangeInfo: { fromStateType: string; toStateType: string } | null = null;
    if (patch.stateId !== undefined && patch.stateId !== current.state_id) {
      // Look up old and new state types for the trigger.
      const statesResult = await tenantClientQuery<WorkflowStateRow>(
        client,
        ctx.workspace.id,
        `SELECT id, type FROM workflow_states WHERE {TENANT} AND id = ANY($1::text[])`,
        [[current.state_id, patch.stateId]],
      );
      const stateMap = new Map(statesResult.rows.map((s) => [s.id, s.type]));
      const fromType = stateMap.get(current.state_id);
      const toType = stateMap.get(patch.stateId);
      if (fromType && toType) {
        stateChangeInfo = { fromStateType: fromType, toStateType: toType };
      }
    }

    for (const change of trackChanges) {
      await recordOnClient(client, {
        workspaceId: ctx.workspace.id,
        actorUserId: ctx.user.id,
        eventType: 'issue.updated',
        targetType: 'issue',
        targetId: updated.id,
        metadata: {
          key: updated.key,
          field: change.field,
          old: change.old,
          new: change.new,
        },
      });
    }

    // --- Issue activity log (structured timeline) ---
    const fieldToAction: Record<string, 'state_change' | 'priority_change' | 'assignment_change' | 'title_edit' | 'description_edit'> = {
      stateId: 'state_change',
      priority: 'priority_change',
      assigneeId: 'assignment_change',
      title: 'title_edit',
      description: 'description_edit',
    };
    for (const change of trackChanges) {
      const action = fieldToAction[change.field];
      if (action) {
        await logActivityOnClient(client, {
          issueId: updated.id,
          workspaceId: ctx.workspace.id,
          actorId: ctx.user.id,
          action,
          oldValue: change.old,
          newValue: change.new,
        });
      }
    }

    // --- Notification triggers (fire-and-forget) — XP-102 ---
    // Fan state_change and blocked toggles out to every assignee (legacy
    // single + issue_assignees multi), so agent-driven changes surface in
    // each collaborator's notification feed, not just the original assignee.
    const actorName = ctx.user.display_name ?? ctx.user.email;
    const wantsBroadcast = trackChanges.some(
      (c) => c.field === 'stateId' || c.field === 'blocked',
    );
    let recipients: string[] = [];
    if (wantsBroadcast) {
      const assigneesRes = await client.query<{ user_id: string }>(
        `SELECT user_id FROM issue_assignees WHERE issue_id = $1`,
        [updated.id],
      );
      const set = new Set(assigneesRes.rows.map((r) => r.user_id));
      if (updated.assignee_id) set.add(updated.assignee_id);
      // The reporter cares about their own issue's activity even when not assigned.
      if (updated.creator_id) set.add(updated.creator_id);
      set.delete(ctx.user.id);
      recipients = [...set];
    }

    for (const change of trackChanges) {
      if (change.field === 'assigneeId' && change.new && change.new !== ctx.user.id) {
        notifyQuietly({
          workspaceId: ctx.workspace.id,
          userId: change.new as string,
          type: 'assigned',
          title: `${actorName} assigned you to ${updated.key}`,
          body: updated.title,
          issueId: updated.id,
          actorId: ctx.user.id,
        });
      }

      if (change.field === 'stateId' && recipients.length > 0) {
        const stateRes = await tenantClientQuery<WorkflowStateRow>(
          client,
          ctx.workspace.id,
          `SELECT name FROM workflow_states WHERE {TENANT} AND id = $1`,
          [change.new],
        );
        const stateName = stateRes.rows[0]?.name ?? 'unknown';
        for (const userId of recipients) {
          notifyQuietly({
            workspaceId: ctx.workspace.id,
            userId,
            type: 'state_change',
            title: `${actorName} moved ${updated.key} to ${stateName}`,
            body: updated.title,
            issueId: updated.id,
            actorId: ctx.user.id,
          });
        }
      }

      if (change.field === 'blocked' && recipients.length > 0) {
        // Reuse the state_change notification type/preference toggle —
        // block/unblock is the same urgency class as a state move, and
        // a dedicated 'block_change' type would require a prefs migration.
        const verb = change.new ? 'blocked' : 'unblocked';
        for (const userId of recipients) {
          notifyQuietly({
            workspaceId: ctx.workspace.id,
            userId,
            type: 'state_change',
            title: `${actorName} ${verb} ${updated.key}`,
            body: updated.title,
            issueId: updated.id,
            actorId: ctx.user.id,
          });
        }
      }
    }

    return { updated, stateChangeInfo };
  });

  // Fire-and-forget automation evaluation for state changes.
  if (result.stateChangeInfo) {
    evaluateAutomations(ctx, {
      type: 'state_change',
      issueId: result.updated.id,
      issueKey: result.updated.key,
      fromStateType: result.stateChangeInfo.fromStateType,
      toStateType: result.stateChangeInfo.toStateType,
    }).catch(() => {});
  }

  dispatchWebhookEvent(ctx.workspace.id, 'issue.updated', {
    issue: { id: result.updated.id, key: result.updated.key, title: result.updated.title },
    actor: { id: ctx.user.id, email: ctx.user.email },
  }).catch(() => {});

  return result.updated;
}

export async function bulkUpdateIssues(input: {
  ctx: FullAuthContext;
  keys: string[];
  patch: IssuePatch;
}): Promise<IssueRow[]> {
  const { ctx, patch } = input;
  const keys = [...new Set(input.keys.map((key) => key.trim()).filter(Boolean))];

  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to update issues');
  }
  if (keys.length === 0) {
    throw new ValidationError('keys must include at least one issue');
  }

  validateIssuePatch(patch);

  return withTransaction(async (client) => {
    const currentResult = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM issues WHERE {TENANT} AND key = ANY($1::text[]) FOR UPDATE`,
      [keys],
    );
    const current = currentResult.rows;
    if (current.length !== keys.length) {
      const found = new Set(current.map((issue) => issue.key));
      const missing = keys.find((key) => !found.has(key));
      throw new NotFoundError(`Issue ${missing ?? 'unknown'} not found`);
    }

    if (patch.stateId !== undefined) {
      const stateExists = await tenantClientQuery<WorkflowStateRow>(
        client,
        ctx.workspace.id,
        `SELECT id FROM workflow_states WHERE {TENANT} AND id = $1`,
        [patch.stateId],
      );
      if (stateExists.rows.length === 0) {
        throw new ValidationError(`stateId ${patch.stateId} not found in workspace`);
      }
    }

    if (patch.assigneeId !== undefined && patch.assigneeId !== null) {
      const userExists = await tenantClientQuery<UserRow>(
        client,
        ctx.workspace.id,
        `SELECT id FROM users WHERE {TENANT} AND id = $1`,
        [patch.assigneeId],
      );
      if (userExists.rows.length === 0) {
        throw new ValidationError(`assigneeId ${patch.assigneeId} is not a workspace member`);
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const stagedFields: Array<{ field: string; column: keyof IssueRow; value: unknown }> = [];

    const stage = (field: string, column: keyof IssueRow, value: unknown) => {
      params.push(value);
      sets.push(`${String(column)} = $${params.length}`);
      stagedFields.push({ field, column, value });
    };

    if (patch.title !== undefined) stage('title', 'title', patch.title.trim());
    if (patch.description !== undefined) {
      const next = patch.description === null ? null : patch.description.trim() || null;
      stage('description', 'description', next);
    }
    if (patch.stateId !== undefined) stage('stateId', 'state_id', patch.stateId);
    if (patch.priority !== undefined) stage('priority', 'priority', patch.priority);
    if (patch.type !== undefined) stage('type', 'type', patch.type);
    if (patch.blocked !== undefined) stage('blocked', 'blocked', patch.blocked);
    if (patch.assigneeId !== undefined) stage('assigneeId', 'assignee_id', patch.assigneeId);
    if (patch.parentId !== undefined) stage('parentId', 'parent_id', patch.parentId);
    if (patch.startDate !== undefined) {
      const v = patch.startDate ? new Date(patch.startDate) : null;
      stage('startDate', 'start_date', v);
    }
    if (patch.dueDate !== undefined) {
      const v = patch.dueDate ? new Date(patch.dueDate) : null;
      stage('dueDate', 'due_date', v);
    }

    const touchedKeys = current
      .filter((issue) => stagedFields.some((field) => issue[field.column] !== field.value))
      .map((issue) => issue.key);

    if (touchedKeys.length === 0) {
      return orderIssuesByKeys(current, keys);
    }

    sets.push(`updated_at = now()`);
    params.push(ctx.workspace.id);
    params.push(touchedKeys);

    const updateResult = await client.query<IssueRow>(
      `
        UPDATE issues
           SET ${sets.join(', ')}
         WHERE workspace_id = $${params.length - 1}
           AND key = ANY($${params.length}::text[])
         RETURNING *
      `,
      params,
    );

    const updatedByKey = new Map(updateResult.rows.map((issue) => [issue.key, issue]));

    for (const issue of current) {
      const updated = updatedByKey.get(issue.key);
      if (!updated) continue;
      for (const field of stagedFields) {
        const oldValue = issue[field.column];
        const newValue = updated[field.column];
        if (oldValue === newValue) continue;
        await recordOnClient(client, {
          workspaceId: ctx.workspace.id,
          actorUserId: ctx.user.id,
          eventType: 'issue.updated',
          targetType: 'issue',
          targetId: updated.id,
          metadata: {
            key: updated.key,
            field: field.field,
            old: oldValue,
            new: newValue,
            bulk: true,
          },
        });
      }
    }

    // Real-time fan-out (XP-3) — one op per actually-updated issue.
    for (const updated of updateResult.rows) {
      await writeOp(client, {
        workspaceId: ctx.workspace.id,
        actorId: ctx.user.id,
        entityType: 'issue',
        entityId: updated.id,
        mutation: 'update',
      });
    }

    // --- Notification triggers (fire-and-forget) — XP-102 ---
    // Mirror updateIssue's fanout for the bulk path so agent-driven bulk
    // state/blocked/assignee moves also reach each issue's collaborators.
    const wantsAssigneeNotify = stagedFields.some((f) => f.field === 'assigneeId');
    const wantsStateNotify = stagedFields.some((f) => f.field === 'stateId');
    const wantsBlockNotify = stagedFields.some((f) => f.field === 'blocked');
    if (wantsAssigneeNotify || wantsStateNotify || wantsBlockNotify) {
      const actorName = ctx.user.display_name ?? ctx.user.email;
      const beforeById = new Map(current.map((c) => [c.id, c]));

      let newStateName: string | null = null;
      if (wantsStateNotify && patch.stateId) {
        const r = await tenantClientQuery<WorkflowStateRow>(
          client,
          ctx.workspace.id,
          `SELECT name FROM workflow_states WHERE {TENANT} AND id = $1`,
          [patch.stateId],
        );
        newStateName = r.rows[0]?.name ?? null;
      }

      const recipientsByIssue = new Map<string, Set<string>>();
      if (wantsStateNotify || wantsBlockNotify) {
        const touchedIds = updateResult.rows.map((r) => r.id);
        if (touchedIds.length > 0) {
          const r = await client.query<{ issue_id: string; user_id: string }>(
            `SELECT issue_id, user_id FROM issue_assignees WHERE issue_id = ANY($1::text[])`,
            [touchedIds],
          );
          for (const row of r.rows) {
            const set = recipientsByIssue.get(row.issue_id) ?? new Set<string>();
            set.add(row.user_id);
            recipientsByIssue.set(row.issue_id, set);
          }
          for (const updated of updateResult.rows) {
            const set = recipientsByIssue.get(updated.id) ?? new Set<string>();
            if (updated.assignee_id) set.add(updated.assignee_id);
            // The reporter cares about their own issue's activity even when not assigned.
            if (updated.creator_id) set.add(updated.creator_id);
            recipientsByIssue.set(updated.id, set);
            set.delete(ctx.user.id);
          }
        }
      }

      for (const updated of updateResult.rows) {
        const before = beforeById.get(updated.id);
        if (!before) continue;

        if (
          wantsAssigneeNotify &&
          updated.assignee_id &&
          updated.assignee_id !== before.assignee_id &&
          updated.assignee_id !== ctx.user.id
        ) {
          notifyQuietly({
            workspaceId: ctx.workspace.id,
            userId: updated.assignee_id,
            type: 'assigned',
            title: `${actorName} assigned you to ${updated.key}`,
            body: updated.title,
            issueId: updated.id,
            actorId: ctx.user.id,
          });
        }

        const recipients = recipientsByIssue.get(updated.id);
        if (wantsStateNotify && newStateName && updated.state_id !== before.state_id && recipients) {
          for (const userId of recipients) {
            notifyQuietly({
              workspaceId: ctx.workspace.id,
              userId,
              type: 'state_change',
              title: `${actorName} moved ${updated.key} to ${newStateName}`,
              body: updated.title,
              issueId: updated.id,
              actorId: ctx.user.id,
            });
          }
        }

        if (wantsBlockNotify && updated.blocked !== before.blocked && recipients) {
          const verb = updated.blocked ? 'blocked' : 'unblocked';
          for (const userId of recipients) {
            notifyQuietly({
              workspaceId: ctx.workspace.id,
              userId,
              type: 'state_change',
              title: `${actorName} ${verb} ${updated.key}`,
              body: updated.title,
              issueId: updated.id,
              actorId: ctx.user.id,
            });
          }
        }
      }
    }

    return orderIssuesByKeys(
      current.map((issue) => updatedByKey.get(issue.key) ?? issue),
      keys,
    );
  });
}

function validateIssuePatch(patch: IssuePatch): void {
  const hasAny =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.stateId !== undefined ||
    patch.priority !== undefined ||
    patch.type !== undefined ||
    patch.blocked !== undefined ||
    patch.assigneeId !== undefined ||
    patch.parentId !== undefined ||
    patch.listId !== undefined ||
    patch.milestoneId !== undefined ||
    patch.coverBlobRef !== undefined ||
    patch.coverPosition !== undefined ||
    patch.startDate !== undefined ||
    patch.dueDate !== undefined ||
    patch.sortOrder !== undefined;
  if (!hasAny) {
    throw new ValidationError('patch must include at least one field');
  }

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 1 || t.length > 500) {
      throw new ValidationError('title must be 1-500 characters');
    }
  }
  if (patch.description !== undefined && patch.description !== null) {
    if (patch.description.length > 50_000) {
      throw new ValidationError('description exceeds 50,000 characters');
    }
  }
  if (patch.priority !== undefined) {
    if (!Number.isInteger(patch.priority) || patch.priority < 0 || patch.priority > 4) {
      throw new ValidationError('priority must be an integer 0..4');
    }
  }
  if (patch.type !== undefined && !isValidIssueType(patch.type)) {
    throw new ValidationError('invalid issue type');
  }
}

export async function listSubIssues(ctx: FullAuthContext, parentKey: string): Promise<IssueRow[]> {
  const parent = await getIssueByKey(ctx, parentKey);
  const { rows } = await tenantPoolQuery<IssueRow>(
    ctx.workspace.id,
    `SELECT * FROM issues WHERE {TENANT} AND parent_id = $1 ORDER BY created_at ASC`,
    [parent.id],
  );
  return rows;
}

export type NavCounts = {
  triage: number;
  my: number;
  active: number;
  backlog: number;
  all: number;
};

export async function navCounts(ctx: FullAuthContext): Promise<NavCounts> {
  const { rows } = await tenantPoolQuery<{
    triage: string;
    my: string;
    active: string;
    backlog: string;
    all: string;
  }>(
    ctx.workspace.id,
    `SELECT
       COUNT(*) FILTER (WHERE ws.type = 'triage' AND i.assignee_id = $1)::text AS triage,
       COUNT(*) FILTER (WHERE i.assignee_id = $1)::text AS my,
       COUNT(*) FILTER (WHERE ws.type = 'started')::text AS active,
       COUNT(*) FILTER (WHERE ws.type = 'backlog')::text AS backlog,
       COUNT(*)::text AS all
     FROM issues i
     JOIN workflow_states ws ON ws.id = i.state_id AND ws.workspace_id = i.workspace_id
     WHERE i.{TENANT} AND i.deleted_at IS NULL AND i.parent_id IS NULL`,
    [ctx.user.id],
  );
  const r = rows[0];
  return {
    triage: r ? parseInt(r.triage, 10) : 0,
    my: r ? parseInt(r.my, 10) : 0,
    active: r ? parseInt(r.active, 10) : 0,
    backlog: r ? parseInt(r.backlog, 10) : 0,
    all: r ? parseInt(r.all, 10) : 0,
  };
}

export type SubIssueCount = {
  parentId: string;
  total: number;
  completed: number;
  canceled: number;
  inProgress: number;
  progress: number;
};

export async function subIssueCounts(
  ctx: FullAuthContext,
  parentIds: string[],
): Promise<Map<string, SubIssueCount>> {
  if (parentIds.length === 0) return new Map();
  const { rows } = await tenantPoolQuery<{
    parent_id: string;
    total: string;
    completed: string;
    canceled: string;
    in_progress: string;
  }>(
    ctx.workspace.id,
    `SELECT i.parent_id,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE ws.type = 'completed')::text AS completed,
            COUNT(*) FILTER (WHERE ws.type = 'canceled')::text AS canceled,
            COUNT(*) FILTER (WHERE ws.type = 'started')::text AS in_progress
       FROM issues i
       JOIN workflow_states ws ON ws.id = i.state_id AND ws.workspace_id = i.workspace_id
      WHERE i.{TENANT} AND i.parent_id = ANY($1::text[]) AND i.deleted_at IS NULL
      GROUP BY i.parent_id`,
    [parentIds],
  );
  const map = new Map<string, SubIssueCount>();
  for (const r of rows) {
    const total = Number.parseInt(r.total, 10);
    const completed = Number.parseInt(r.completed, 10);
    const canceled = Number.parseInt(r.canceled, 10);
    map.set(r.parent_id, {
      parentId: r.parent_id,
      total,
      completed,
      canceled,
      inProgress: Number.parseInt(r.in_progress, 10),
      progress: total > 0 ? (completed + canceled) / total : 0,
    });
  }
  return map;
}

export async function softDeleteIssue(ctx: FullAuthContext, key: string): Promise<IssueRow> {
  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to delete issues');
  }

  const deleted = await withTransaction(async (client) => {
    const result = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `UPDATE issues SET deleted_at = now(), updated_at = now()
       WHERE {TENANT} AND key = $1 AND deleted_at IS NULL
       RETURNING *`,
      [key],
    );
    const issue = result.rows[0];
    if (!issue) throw new NotFoundError(`Issue ${key} not found`);

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.deleted',
      targetType: 'issue',
      targetId: issue.id,
      metadata: { key: issue.key },
    });

    await writeOp(client, {
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      entityType: 'issue',
      entityId: issue.id,
      mutation: 'delete',
    });

    return issue;
  });

  dispatchWebhookEvent(ctx.workspace.id, 'issue.deleted', {
    issue: { id: deleted.id, key: deleted.key, title: deleted.title },
    actor: { id: ctx.user.id, email: ctx.user.email },
  }).catch(() => {});

  return deleted;
}

export async function restoreIssue(ctx: FullAuthContext, key: string): Promise<IssueRow> {
  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to restore issues');
  }

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `UPDATE issues SET deleted_at = NULL, updated_at = now()
       WHERE {TENANT} AND key = $1 AND deleted_at IS NOT NULL
       RETURNING *`,
      [key],
    );
    const issue = result.rows[0];
    if (!issue) throw new NotFoundError(`Issue ${key} not found or not deleted`);

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.restored',
      targetType: 'issue',
      targetId: issue.id,
      metadata: { key: issue.key },
    });

    await writeOp(client, {
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      entityType: 'issue',
      entityId: issue.id,
      mutation: 'update',
    });

    return issue;
  });
}

export async function listDeletedIssues(ctx: FullAuthContext): Promise<IssueRow[]> {
  const { rows } = await tenantPoolQuery<IssueRow>(
    ctx.workspace.id,
    `SELECT * FROM issues WHERE {TENANT} AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200`,
  );
  return rows;
}

export async function archiveIssue(ctx: FullAuthContext, key: string): Promise<IssueRow> {
  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to archive issues');
  }

  const archived = await withTransaction(async (client) => {
    const result = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `UPDATE issues SET archived_at = now(), updated_at = now()
       WHERE {TENANT} AND key = $1 AND deleted_at IS NULL AND archived_at IS NULL
       RETURNING *`,
      [key],
    );
    const issue = result.rows[0];
    if (!issue) throw new NotFoundError(`Issue ${key} not found`);

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.archived',
      targetType: 'issue',
      targetId: issue.id,
      metadata: { key: issue.key },
    });

    await writeOp(client, {
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      entityType: 'issue',
      entityId: issue.id,
      mutation: 'delete',
    });

    return issue;
  });

  dispatchWebhookEvent(ctx.workspace.id, 'issue.archived', {
    issue: { id: archived.id, key: archived.key, title: archived.title },
    actor: { id: ctx.user.id, email: ctx.user.email },
  }).catch(() => {});

  return archived;
}

export async function unarchiveIssue(ctx: FullAuthContext, key: string): Promise<IssueRow> {
  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to unarchive issues');
  }

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `UPDATE issues SET archived_at = NULL, updated_at = now()
       WHERE {TENANT} AND key = $1 AND archived_at IS NOT NULL
       RETURNING *`,
      [key],
    );
    const issue = result.rows[0];
    if (!issue) throw new NotFoundError(`Issue ${key} not found or not archived`);

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.unarchived',
      targetType: 'issue',
      targetId: issue.id,
      metadata: { key: issue.key },
    });

    await writeOp(client, {
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      entityType: 'issue',
      entityId: issue.id,
      mutation: 'update',
    });

    return issue;
  });
}

export async function listArchivedIssues(
  ctx: FullAuthContext,
  projectId?: string,
): Promise<IssueRow[]> {
  const { rows } = await tenantPoolQuery<IssueRow>(
    ctx.workspace.id,
    `SELECT * FROM issues
     WHERE {TENANT} AND archived_at IS NOT NULL AND deleted_at IS NULL
     ${projectId ? 'AND project_id = $1' : ''}
     ORDER BY archived_at DESC LIMIT 500`,
    projectId ? [projectId] : [],
  );
  return rows;
}

function orderIssuesByKeys(issues: IssueRow[], keys: string[]): IssueRow[] {
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  return keys
    .map((key) => byKey.get(key))
    .filter((issue): issue is IssueRow => issue !== undefined);
}

/**
 * Move an issue to a different project. Assigns a new key in the target project
 * and stores the old key as a resolvable alias.
 */
export async function moveIssueToProject(input: {
  ctx: FullAuthContext;
  key: string;
  targetProjectId: string;
}): Promise<IssueRow> {
  const { ctx, key, targetProjectId } = input;

  if (!canUpdateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to move issues');
  }

  return withTransaction(async (client) => {
    // Lock the issue.
    const currentResult = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM issues WHERE {TENANT} AND key = $1 FOR UPDATE`,
      [key],
    );
    const current = currentResult.rows[0];
    if (!current) throw new NotFoundError(`Issue ${key} not found`);

    if (current.project_id === targetProjectId) {
      return current; // already in target project
    }

    // Look up target project.
    const projectResult = await tenantClientQuery<ProjectRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM projects WHERE {TENANT} AND id = $1`,
      [targetProjectId],
    );
    const targetProject = projectResult.rows[0];
    if (!targetProject) {
      throw new ValidationError(`Target project not found in workspace`);
    }

    // Allocate new key in target project.
    const counterResult = await client.query<{ last_key: number }>(
      `INSERT INTO project_key_counters (project_id, last_key)
       VALUES ($1, 1)
       ON CONFLICT (project_id)
       DO UPDATE SET last_key = project_key_counters.last_key + 1
       RETURNING last_key`,
      [targetProjectId],
    );
    const counter = counterResult.rows[0];
    if (!counter) throw new Error('Failed to allocate key counter for target project');
    const newKey = `${targetProject.key}-${counter.last_key}`;

    // Store old key as alias.
    await client.query(
      `INSERT INTO issue_key_aliases (id, workspace_id, issue_id, old_key)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (workspace_id, old_key) DO NOTHING`,
      [ctx.workspace.id, current.id, current.key],
    );

    // Update the issue.
    const updateResult = await client.query<IssueRow>(
      `UPDATE issues
          SET key = $1, project_id = $2, updated_at = now()
        WHERE id = $3
        RETURNING *`,
      [newKey, targetProjectId, current.id],
    );
    const updated = updateResult.rows[0];
    if (!updated) throw new Error('Failed to move issue');

    // Audit.
    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.moved',
      targetType: 'issue',
      targetId: updated.id,
      metadata: {
        oldKey: current.key,
        newKey: updated.key,
        fromProjectId: current.project_id,
        toProjectId: targetProjectId,
      },
    });

    return updated;
  });
}

/**
 * Get the user's last-used project ID in the workspace (for pre-selecting
 * the project in the issue creation form).
 */
export async function getLastUsedProjectId(ctx: FullAuthContext): Promise<string | null> {
  const { rows } = await tenantPoolQuery<{ last_used_project_id: string | null }>(
    ctx.workspace.id,
    `SELECT last_used_project_id FROM user_project_preferences
     WHERE user_id = $1 AND {TENANT}`,
    [ctx.user.id],
  );
  return rows[0]?.last_used_project_id ?? null;
}
