import { getPool, withTransaction, tenantClientQuery } from '@xpntl/db';
import type { IssueRow, WorkflowStateRow } from '../types.js';
import { recordOnClient } from '../audit/audit.service.js';

export type RecurrenceInput = {
  rule: string;
  active?: boolean;
};

export function nextOccurrence(rule: string, after: Date): Date | null {
  const r = rule.trim().toLowerCase();

  if (r === 'daily') {
    const next = new Date(after);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }

  const weeklyMatch = r.match(/^weekly(?:\s+on\s+(.+))?$/);
  if (weeklyMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDays = weeklyMatch[1]
      ? weeklyMatch[1].split(',').map((d) => dayNames.indexOf(d.trim()))
          .filter((d) => d >= 0)
      : [after.getDay()];
    if (targetDays.length === 0) return null;

    const next = new Date(after);
    next.setHours(9, 0, 0, 0);
    for (let i = 1; i <= 7; i++) {
      next.setDate(after.getDate() + i);
      if (targetDays.includes(next.getDay())) return next;
    }
    return null;
  }

  const monthlyMatch = r.match(/^monthly(?:\s+on\s+(\d+))?$/);
  if (monthlyMatch) {
    const day = monthlyMatch[1] ? parseInt(monthlyMatch[1], 10) : after.getDate();
    const next = new Date(after);
    next.setMonth(next.getMonth() + 1, Math.min(day, 28));
    next.setHours(9, 0, 0, 0);
    return next;
  }

  const everyNMatch = r.match(/^every\s+(\d+)\s+(day|week|month)s?$/);
  if (everyNMatch) {
    const n = parseInt(everyNMatch[1]!, 10);
    const unit = everyNMatch[2]!;
    const next = new Date(after);
    next.setHours(9, 0, 0, 0);
    if (unit === 'day') next.setDate(next.getDate() + n);
    else if (unit === 'week') next.setDate(next.getDate() + n * 7);
    else if (unit === 'month') next.setMonth(next.getMonth() + n);
    return next;
  }

  return null;
}

export async function setRecurrence(
  ctx: { workspace: { id: string }; user: { id: string } },
  issueKey: string,
  input: RecurrenceInput,
): Promise<IssueRow> {
  return withTransaction(async (client) => {
    const result = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM issues WHERE {TENANT} AND key = $1 FOR UPDATE`,
      [issueKey],
    );
    const issue = result.rows[0];
    if (!issue) throw new Error(`Issue ${issueKey} not found`);

    const active = input.active ?? true;
    const nextAt = active ? nextOccurrence(input.rule, new Date()) : null;

    const updated = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `UPDATE issues
          SET recurrence_rule = $1,
              recurrence_active = $2,
              recurrence_next_at = $3,
              updated_at = now()
        WHERE {TENANT} AND key = $4
        RETURNING *`,
      [input.rule, active, nextAt, issueKey],
    );

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.recurrence_set',
      targetType: 'issue',
      targetId: issue.id,
      metadata: { rule: input.rule, active },
    });

    return updated.rows[0]!;
  });
}

export async function clearRecurrence(
  ctx: { workspace: { id: string }; user: { id: string } },
  issueKey: string,
): Promise<IssueRow> {
  return withTransaction(async (client) => {
    const updated = await tenantClientQuery<IssueRow>(
      client,
      ctx.workspace.id,
      `UPDATE issues
          SET recurrence_rule = NULL,
              recurrence_active = false,
              recurrence_next_at = NULL,
              updated_at = now()
        WHERE {TENANT} AND key = $1
        RETURNING *`,
      [issueKey],
    );
    if (!updated.rows[0]) throw new Error(`Issue ${issueKey} not found`);

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'issue.recurrence_cleared',
      targetType: 'issue',
      targetId: updated.rows[0].id,
      metadata: {},
    });

    return updated.rows[0];
  });
}

export async function processDueRecurrences(): Promise<number> {
  let created = 0;

  const pool = getPool();
  const dueResult = await pool.query<IssueRow>(
    `SELECT * FROM issues
      WHERE recurrence_active = true
        AND recurrence_next_at IS NOT NULL
        AND recurrence_next_at <= now()
        AND deleted_at IS NULL
      ORDER BY recurrence_next_at ASC
      LIMIT 100`,
    [],
  );

  for (const source of dueResult.rows) {
    try {
      await withTransaction(async (client) => {
        const locked = await client.query<IssueRow>(
          `SELECT * FROM issues WHERE id = $1 FOR UPDATE`,
          [source.id],
        );
        const issue = locked.rows[0];
        if (!issue || !issue.recurrence_active || !issue.recurrence_next_at) return;
        if (issue.recurrence_next_at > new Date()) return;

        const counterResult = await client.query<{ last_key: number }>(
          `UPDATE issue_key_counters
              SET last_key = last_key + 1
            WHERE workspace_id = $1
            RETURNING last_key`,
          [issue.workspace_id],
        );
        const counter = counterResult.rows[0]?.last_key;
        if (!counter) return;

        const wsResult = await client.query<{ key: string }>(
          `SELECT key FROM workspaces WHERE id = $1`,
          [issue.workspace_id],
        );
        const wsKey = wsResult.rows[0]?.key;
        if (!wsKey) return;

        const newKey = `${wsKey}-${counter}`;

        const defaultState = await client.query<WorkflowStateRow>(
          `SELECT id FROM workflow_states
            WHERE workspace_id = $1
            ORDER BY position ASC LIMIT 1`,
          [issue.workspace_id],
        );
        const stateId = defaultState.rows[0]?.id ?? issue.state_id;

        await client.query(
          `INSERT INTO issues (workspace_id, key, title, description, state_id, priority,
                               assignee_id, creator_id, parent_id, team_id, project_id,
                               milestone_id, recurrence_source_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            issue.workspace_id,
            newKey,
            issue.title,
            issue.description,
            stateId,
            issue.priority,
            issue.assignee_id,
            issue.creator_id,
            issue.parent_id,
            issue.team_id,
            issue.project_id,
            issue.milestone_id,
            issue.id,
          ],
        );

        const nextAt = issue.recurrence_rule
          ? nextOccurrence(issue.recurrence_rule, new Date())
          : null;

        await client.query(
          `UPDATE issues
              SET recurrence_next_at = $1,
                  recurrence_active = $2,
                  updated_at = now()
            WHERE id = $3`,
          [nextAt, nextAt !== null, issue.id],
        );

        created++;
      });
    } catch (err) {
      console.error(`[recurrence] Failed to process issue ${source.id}:`, err);
    }
  }

  return created;
}
