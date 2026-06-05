import { isAtLeast } from '@xpntl/auth';
import { type PoolClient, getPool, tenantPoolQuery } from '@xpntl/db';
import { ForbiddenError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type AuditEvent = {
  workspaceId: string;
  actorUserId: string | null;
  eventType: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

const INSERT_SQL = `
  INSERT INTO audit_log
    (id, workspace_id, actor_user_id, event_type, target_type, target_id, metadata, ip, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
`;

/**
 * Record an audit event. Free on every plan, same code path cloud + self-host
 * ([PER-95](https://linear.app/centrixiq/issue/PER-95)).
 *
 * Use `recordOnClient` inside a `withTransaction` so the event commits or rolls
 * back together with the underlying domain action.
 */
export async function record(event: AuditEvent): Promise<void> {
  await getPool().query(INSERT_SQL, toParams(event));
}

export async function recordOnClient(client: PoolClient, event: AuditEvent): Promise<void> {
  await client.query(INSERT_SQL, toParams(event));
}

function toParams(event: AuditEvent): unknown[] {
  return [
    newId(),
    event.workspaceId,
    event.actorUserId,
    event.eventType,
    event.targetType ?? null,
    event.targetId ?? null,
    JSON.stringify(event.metadata ?? {}),
    event.ip ?? null,
    event.userAgent ?? null,
  ];
}

// ── Query ────────────────────────────────────────────────

export type AuditLogEntry = {
  id: string;
  workspace_id: string;
  actor_user_id: string;
  event_type: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  ip: string | null;
  user_agent: string | null;
};

export async function queryAuditLog(
  ctx: FullAuthContext,
  opts: {
    eventType?: string;
    targetType?: string;
    actorId?: string;
    limit?: number;
    cursor?: string;
  },
): Promise<AuditLogEntry[]> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can view the audit log');
  }

  const conditions: string[] = ['{TENANT}'];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.eventType) {
    conditions.push(`event_type = $${idx++}`);
    params.push(opts.eventType);
  }
  if (opts.targetType) {
    conditions.push(`target_type = $${idx++}`);
    params.push(opts.targetType);
  }
  if (opts.actorId) {
    conditions.push(`actor_user_id = $${idx++}`);
    params.push(opts.actorId);
  }
  if (opts.cursor) {
    conditions.push(`created_at < $${idx++}`);
    params.push(new Date(opts.cursor));
  }

  const limit = Math.min(opts.limit ?? 50, 200);

  const sql = `
    SELECT id, workspace_id, actor_user_id, event_type, target_type, target_id,
           metadata, created_at, ip, user_agent
    FROM audit_log
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  const result = await tenantPoolQuery<AuditLogEntry>(ctx.workspace.id, sql, params);
  return result.rows;
}
