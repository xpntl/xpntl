import { tenantPoolQuery } from '@xpntl/db';
import { isAtLeast } from '@xpntl/auth';
import { ForbiddenError } from '../errors.js';
import type { FullAuthContext } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertMember(ctx: FullAuthContext): void {
  if (!isAtLeast(ctx.user.role, 'Member')) {
    throw new ForbiddenError('Requires at least Member role');
  }
}

// ---------------------------------------------------------------------------
// Cycle-time stats
// ---------------------------------------------------------------------------

export type CycleTimeStats = {
  count: number;
  avgHours: number;
  p50Hours: number;
  p75Hours: number;
  p90Hours: number;
};

/**
 * Average and p50/p75/p90 cycle time (created_at to state becoming 'completed'),
 * measured in hours.
 */
export async function getCycleTimeStats(
  ctx: FullAuthContext,
  opts?: { projectId?: string; days?: number },
): Promise<CycleTimeStats> {
  assertMember(ctx);

  const days = opts?.days ?? 90;
  const params: unknown[] = [days];
  let projectFilter = '';
  if (opts?.projectId) {
    params.push(opts.projectId);
    projectFilter = `AND i.project_id = $${params.length}`;
  }

  const sql = `
    SELECT
      count(*)::int AS count,
      coalesce(avg(age_hours), 0) AS avg_hours,
      coalesce(percentile_cont(0.50) WITHIN GROUP (ORDER BY age_hours), 0) AS p50,
      coalesce(percentile_cont(0.75) WITHIN GROUP (ORDER BY age_hours), 0) AS p75,
      coalesce(percentile_cont(0.90) WITHIN GROUP (ORDER BY age_hours), 0) AS p90
    FROM (
      SELECT extract(epoch FROM (i.updated_at - i.created_at)) / 3600.0 AS age_hours
      FROM issues i
      JOIN workflow_states ws ON ws.id = i.state_id AND ws.{TENANT}
      WHERE i.{TENANT}
        AND ws.type = 'completed'
        AND i.deleted_at IS NULL
        AND i.updated_at >= now() - ($1 || ' days')::interval
        ${projectFilter}
    ) sub
  `;

  const { rows } = await tenantPoolQuery<{
    count: number;
    avg_hours: number;
    p50: number;
    p75: number;
    p90: number;
  }>(ctx.workspace.id, sql, params);

  const r = rows[0]!;
  return {
    count: r.count,
    avgHours: Math.round(r.avg_hours * 10) / 10,
    p50Hours: Math.round(r.p50 * 10) / 10,
    p75Hours: Math.round(r.p75 * 10) / 10,
    p90Hours: Math.round(r.p90 * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Throughput — issues completed per week
// ---------------------------------------------------------------------------

export type ThroughputBucket = {
  weekStart: string;
  count: number;
};

/**
 * Number of issues completed per ISO week for the last N days.
 */
export async function getThroughput(
  ctx: FullAuthContext,
  opts?: { projectId?: string; days?: number },
): Promise<ThroughputBucket[]> {
  assertMember(ctx);

  const days = opts?.days ?? 90;
  const params: unknown[] = [days];
  let projectFilter = '';
  if (opts?.projectId) {
    params.push(opts.projectId);
    projectFilter = `AND i.project_id = $${params.length}`;
  }

  const sql = `
    SELECT
      date_trunc('week', i.updated_at)::date AS week_start,
      count(*)::int AS count
    FROM issues i
    JOIN workflow_states ws ON ws.id = i.state_id AND ws.{TENANT}
    WHERE i.{TENANT}
      AND ws.type = 'completed'
      AND i.deleted_at IS NULL
      AND i.updated_at >= now() - ($1 || ' days')::interval
      ${projectFilter}
    GROUP BY 1
    ORDER BY 1
  `;

  const { rows } = await tenantPoolQuery<{ week_start: string; count: number }>(
    ctx.workspace.id,
    sql,
    params,
  );

  return rows.map((r) => ({
    weekStart: r.week_start,
    count: r.count,
  }));
}

// ---------------------------------------------------------------------------
// Velocity — issues completed per week (last N weeks)
// ---------------------------------------------------------------------------

export type VelocityBucket = {
  weekStart: string;
  completed: number;
};

export async function getVelocity(
  ctx: FullAuthContext,
  opts?: { projectId?: string; weeks?: number },
): Promise<VelocityBucket[]> {
  assertMember(ctx);

  const weeks = opts?.weeks ?? 12;
  const params: unknown[] = [weeks];
  let projectFilter = '';
  if (opts?.projectId) {
    params.push(opts.projectId);
    projectFilter = `AND i.project_id = $${params.length}`;
  }

  const sql = `
    SELECT
      date_trunc('week', i.updated_at)::date AS week_start,
      count(*)::int AS completed
    FROM issues i
    JOIN workflow_states ws ON ws.id = i.state_id AND ws.{TENANT}
    WHERE i.{TENANT}
      AND ws.type = 'completed'
      AND i.deleted_at IS NULL
      AND i.updated_at >= now() - ($1 || ' weeks')::interval
      ${projectFilter}
    GROUP BY 1
    ORDER BY 1
  `;

  const { rows } = await tenantPoolQuery<{ week_start: string; completed: number }>(
    ctx.workspace.id,
    sql,
    params,
  );

  return rows.map((r) => ({
    weekStart: r.week_start,
    completed: r.completed,
  }));
}

// ---------------------------------------------------------------------------
// Burndown — daily buckets for a project over the last 30 days
// ---------------------------------------------------------------------------

export type BurndownBucket = {
  date: string;
  total: number;
  completed: number;
  remaining: number;
};

export async function getBurndown(
  ctx: FullAuthContext,
  opts: { projectId: string },
): Promise<BurndownBucket[]> {
  assertMember(ctx);

  const sql = `
    WITH day_series AS (
      SELECT generate_series(
        (current_date - 29),
        current_date,
        '1 day'::interval
      )::date AS d
    ),
    total_by_day AS (
      SELECT ds.d,
             count(i.id)::int AS total
      FROM day_series ds
      LEFT JOIN issues i
        ON i.{TENANT}
        AND i.project_id = $1
        AND i.deleted_at IS NULL
        AND i.created_at::date <= ds.d
      GROUP BY ds.d
    ),
    completed_by_day AS (
      SELECT ds.d,
             count(i.id)::int AS completed
      FROM day_series ds
      LEFT JOIN issues i
        ON i.{TENANT}
        AND i.project_id = $1
        AND i.deleted_at IS NULL
        AND i.created_at::date <= ds.d
      LEFT JOIN workflow_states ws
        ON ws.id = i.state_id AND ws.{TENANT}
      WHERE (i.id IS NULL OR (ws.type = 'completed' AND i.updated_at::date <= ds.d))
      GROUP BY ds.d
    )
    SELECT
      t.d::date AS date,
      t.total,
      coalesce(c.completed, 0)::int AS completed,
      (t.total - coalesce(c.completed, 0))::int AS remaining
    FROM total_by_day t
    LEFT JOIN completed_by_day c ON c.d = t.d
    ORDER BY t.d
  `;

  const { rows } = await tenantPoolQuery<{
    date: string;
    total: number;
    completed: number;
    remaining: number;
  }>(ctx.workspace.id, sql, [opts.projectId]);

  return rows.map((r) => ({
    date: r.date,
    total: r.total,
    completed: r.completed,
    remaining: r.remaining,
  }));
}

// ---------------------------------------------------------------------------
// Issue load by assignee
// ---------------------------------------------------------------------------

export type AssigneeLoad = {
  assigneeId: string;
  displayName: string | null;
  email: string;
  openCount: number;
};

/**
 * Count of open issues (state type not in completed/canceled) per assignee.
 */
export async function getIssueLoadByAssignee(
  ctx: FullAuthContext,
): Promise<AssigneeLoad[]> {
  assertMember(ctx);

  const sql = `
    SELECT
      u.id AS assignee_id,
      u.display_name,
      u.email,
      count(i.id)::int AS open_count
    FROM issues i
    JOIN workflow_states ws ON ws.id = i.state_id AND ws.{TENANT}
    JOIN users u ON u.id = i.assignee_id AND u.{TENANT}
    WHERE i.{TENANT}
      AND i.deleted_at IS NULL
      AND i.assignee_id IS NOT NULL
      AND ws.type NOT IN ('completed', 'canceled')
    GROUP BY u.id, u.display_name, u.email
    ORDER BY open_count DESC
  `;

  const { rows } = await tenantPoolQuery<{
    assignee_id: string;
    display_name: string | null;
    email: string;
    open_count: number;
  }>(ctx.workspace.id, sql, []);

  return rows.map((r) => ({
    assigneeId: r.assignee_id,
    displayName: r.display_name,
    email: r.email,
    openCount: r.open_count,
  }));
}
