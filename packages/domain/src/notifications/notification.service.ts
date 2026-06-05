import { getPool, tenantPoolQuery } from '@xpntl/db';
import { newId } from '../id.js';
import { ValidationError } from '../errors.js';
import type { FullAuthContext } from '../types.js';

export type NotificationRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  type: 'mention' | 'assigned' | 'state_change' | 'comment' | 'due_soon';
  title: string;
  body: string | null;
  issue_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  read_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
};

export type CreateNotificationInput = {
  workspaceId: string;
  userId: string;
  type: NotificationRow['type'];
  title: string;
  body?: string | null;
  issueId?: string | null;
  commentId?: string | null;
  actorId?: string | null;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const id = newId();
  const result = await getPool().query<NotificationRow>(
    `INSERT INTO notifications (id, workspace_id, user_id, type, title, body, issue_id, comment_id, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      input.workspaceId,
      input.userId,
      input.type,
      input.title,
      input.body ?? null,
      input.issueId ?? null,
      input.commentId ?? null,
      input.actorId ?? null,
    ],
  );
  return result.rows[0]!;
}

/**
 * Fire-and-forget helper: creates a notification swallowing any errors.
 * Checks user preferences before creating — silently skips if the user
 * has disabled this notification type.
 */
export function notifyQuietly(input: CreateNotificationInput): void {
  // TEMP DEBUG (XP-105 diag): log entry + outcome so we can see if prefs block,
  // if the INSERT fires, or if an error is being swallowed silently.
  console.log('[notify-debug:notifyQuietly:enter]', JSON.stringify({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: input.type,
    issueId: input.issueId ?? null,
  }));
  isNotificationEnabled(input.workspaceId, input.userId, input.type)
    .then((enabled) => {
      console.log('[notify-debug:notifyQuietly:enabled]', JSON.stringify({
        userId: input.userId,
        type: input.type,
        enabled,
      }));
      if (enabled) {
        return createNotification(input).then((n) => {
          console.log('[notify-debug:notifyQuietly:created]', JSON.stringify({
            id: n.id,
            userId: n.user_id,
            workspaceId: n.workspace_id,
            type: n.type,
          }));
        });
      }
    })
    .catch((err) => {
      console.log('[notify-debug:notifyQuietly:error]', JSON.stringify({
        userId: input.userId,
        type: input.type,
        message: err instanceof Error ? err.message : String(err),
      }));
    });
}

export type ListNotificationsOpts = {
  /** When true, only unread (`read_at IS NULL`). */
  unread?: boolean;
  /** Archive filter (XP-105). 'active' (default): exclude archived. 'archived': only archived. 'all': both. */
  archived?: 'active' | 'archived' | 'all';
  limit?: number;
  cursor?: string; // created_at ISO string for keyset pagination
};

export type NotificationWithIssueKey = NotificationRow & { issue_key: string | null };

export async function listNotifications(
  ctx: FullAuthContext,
  opts: ListNotificationsOpts = {},
): Promise<NotificationWithIssueKey[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const conditions: string[] = ['n.{TENANT}', 'n.user_id = $1'];
  const params: unknown[] = [ctx.user.id];

  if (opts.unread) {
    conditions.push('n.read_at IS NULL');
  }
  const archived = opts.archived ?? 'active';
  if (archived === 'active') conditions.push('n.archived_at IS NULL');
  else if (archived === 'archived') conditions.push('n.archived_at IS NOT NULL');
  // 'all' adds no archive predicate.

  if (opts.cursor) {
    params.push(opts.cursor);
    conditions.push(`n.created_at < $${params.length}`);
  }

  const sql = `SELECT n.*, i.key AS issue_key
    FROM notifications n
    LEFT JOIN issues i ON i.id = n.issue_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY n.created_at DESC
    LIMIT ${limit}`;

  const { rows } = await tenantPoolQuery<NotificationWithIssueKey>(
    ctx.workspace.id,
    sql,
    params,
  );
  return rows;
}

export async function markRead(
  ctx: FullAuthContext,
  notificationId: string,
): Promise<void> {
  await tenantPoolQuery(
    ctx.workspace.id,
    `UPDATE notifications SET read_at = now()
     WHERE {TENANT} AND id = $1 AND user_id = $2 AND read_at IS NULL`,
    [notificationId, ctx.user.id],
  );
}

export async function markAllRead(ctx: FullAuthContext): Promise<number> {
  const { rowCount } = await tenantPoolQuery(
    ctx.workspace.id,
    `UPDATE notifications SET read_at = now()
     WHERE {TENANT} AND user_id = $1 AND read_at IS NULL`,
    [ctx.user.id],
  );
  return rowCount ?? 0;
}

export async function markUnread(
  ctx: FullAuthContext,
  notificationId: string,
): Promise<void> {
  await tenantPoolQuery(
    ctx.workspace.id,
    `UPDATE notifications SET read_at = NULL
     WHERE {TENANT} AND id = $1 AND user_id = $2`,
    [notificationId, ctx.user.id],
  );
}

export async function markArchived(
  ctx: FullAuthContext,
  notificationId: string,
): Promise<void> {
  // Archiving also marks read — the inbox should never show an archived
  // item as unread, and the unread-count must drop in lock-step.
  await tenantPoolQuery(
    ctx.workspace.id,
    `UPDATE notifications
        SET archived_at = COALESCE(archived_at, now()),
            read_at = COALESCE(read_at, now())
      WHERE {TENANT} AND id = $1 AND user_id = $2`,
    [notificationId, ctx.user.id],
  );
}

export async function markUnarchived(
  ctx: FullAuthContext,
  notificationId: string,
): Promise<void> {
  await tenantPoolQuery(
    ctx.workspace.id,
    `UPDATE notifications SET archived_at = NULL
     WHERE {TENANT} AND id = $1 AND user_id = $2`,
    [notificationId, ctx.user.id],
  );
}

export async function getUnreadCount(ctx: FullAuthContext): Promise<number> {
  const { rows } = await tenantPoolQuery<{ count: string }>(
    ctx.workspace.id,
    `SELECT COUNT(*)::text AS count FROM notifications
     WHERE {TENANT} AND user_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
    [ctx.user.id],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

// ── Notification Preferences ──

export type NotificationPreferencesRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  mention: boolean;
  assigned: boolean;
  state_change: boolean;
  comment: boolean;
  due_soon: boolean;
  email_digest: 'none' | 'daily' | 'weekly';
  created_at: Date;
  updated_at: Date;
};

const NOTIFICATION_TYPE_COLUMNS: Record<NotificationRow['type'], keyof NotificationPreferencesRow> = {
  mention: 'mention',
  assigned: 'assigned',
  state_change: 'state_change',
  comment: 'comment',
  due_soon: 'due_soon',
};

async function isNotificationEnabled(
  workspaceId: string,
  userId: string,
  type: NotificationRow['type'],
): Promise<boolean> {
  const col = NOTIFICATION_TYPE_COLUMNS[type];
  const { rows } = await getPool().query<Record<string, boolean>>(
    `SELECT ${col} FROM notification_preferences WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  if (!rows[0]) return true;
  return rows[0][col] !== false;
}

const DEFAULT_PREFS: Omit<NotificationPreferencesRow, 'id' | 'workspace_id' | 'user_id' | 'created_at' | 'updated_at'> = {
  mention: true,
  assigned: true,
  state_change: true,
  comment: true,
  due_soon: true,
  email_digest: 'none',
};

export async function getNotificationPreferences(
  ctx: FullAuthContext,
): Promise<NotificationPreferencesRow> {
  const { rows } = await getPool().query<NotificationPreferencesRow>(
    `SELECT * FROM notification_preferences WHERE workspace_id = $1 AND user_id = $2`,
    [ctx.workspace.id, ctx.user.id],
  );
  if (rows[0]) return rows[0];
  return {
    id: '',
    workspace_id: ctx.workspace.id,
    user_id: ctx.user.id,
    ...DEFAULT_PREFS,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

export type UpdateNotificationPrefsInput = {
  mention?: boolean;
  assigned?: boolean;
  stateChange?: boolean;
  comment?: boolean;
  dueSoon?: boolean;
  emailDigest?: 'none' | 'daily' | 'weekly';
};

const VALID_DIGESTS = ['none', 'daily', 'weekly'];

export async function updateNotificationPreferences(
  ctx: FullAuthContext,
  input: UpdateNotificationPrefsInput,
): Promise<NotificationPreferencesRow> {
  if (input.emailDigest !== undefined && !VALID_DIGESTS.includes(input.emailDigest)) {
    throw new ValidationError('emailDigest must be none, daily, or weekly');
  }

  const { rows: existing } = await getPool().query<NotificationPreferencesRow>(
    `SELECT * FROM notification_preferences WHERE workspace_id = $1 AND user_id = $2`,
    [ctx.workspace.id, ctx.user.id],
  );

  if (!existing[0]) {
    const id = newId();
    const { rows } = await getPool().query<NotificationPreferencesRow>(
      `INSERT INTO notification_preferences (id, workspace_id, user_id, mention, assigned, state_change, comment, due_soon, email_digest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        ctx.workspace.id,
        ctx.user.id,
        input.mention ?? true,
        input.assigned ?? true,
        input.stateChange ?? true,
        input.comment ?? true,
        input.dueSoon ?? true,
        input.emailDigest ?? 'none',
      ],
    );
    return rows[0]!;
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.mention !== undefined) { params.push(input.mention); sets.push(`mention = $${params.length}`); }
  if (input.assigned !== undefined) { params.push(input.assigned); sets.push(`assigned = $${params.length}`); }
  if (input.stateChange !== undefined) { params.push(input.stateChange); sets.push(`state_change = $${params.length}`); }
  if (input.comment !== undefined) { params.push(input.comment); sets.push(`comment = $${params.length}`); }
  if (input.dueSoon !== undefined) { params.push(input.dueSoon); sets.push(`due_soon = $${params.length}`); }
  if (input.emailDigest !== undefined) { params.push(input.emailDigest); sets.push(`email_digest = $${params.length}`); }

  if (sets.length === 0) return existing[0];

  sets.push('updated_at = now()');
  params.push(ctx.workspace.id);
  params.push(ctx.user.id);

  const { rows } = await getPool().query<NotificationPreferencesRow>(
    `UPDATE notification_preferences SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0]!;
}
