import { notifications } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const notificationsRouter: Router = Router();

notificationsRouter.use(requireFullAuth);

/** GET /v1/notifications — list notifications (paginated, ?unread=true, ?archived=active|archived|all) */
notificationsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const unread = req.query.unread === 'true';
  const archivedQ = typeof req.query.archived === 'string' ? req.query.archived : 'active';
  const archived: 'active' | 'archived' | 'all' =
    archivedQ === 'archived' || archivedQ === 'all' ? archivedQ : 'active';
  const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  const items = await notifications.listNotifications(ctx, { unread, archived, limit, cursor });
  res.json({
    notifications: items.map(toNotificationJson),
  });
});

/** GET /v1/notifications/unread-count — get unread count */
notificationsRouter.get('/unread-count', async (req, res) => {
  const ctx = getAuth(req);
  const count = await notifications.getUnreadCount(ctx);
  res.json({ count });
});

/** PATCH /v1/notifications/:id/read — mark single as read */
notificationsRouter.patch('/:id/read', async (req, res) => {
  const ctx = getAuth(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  await notifications.markRead(ctx, id);
  res.json({ ok: true });
});

/** PATCH /v1/notifications/:id/unread — mark single as unread (XP-105) */
notificationsRouter.patch('/:id/unread', async (req, res) => {
  const ctx = getAuth(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  await notifications.markUnread(ctx, id);
  res.json({ ok: true });
});

/** PATCH /v1/notifications/:id/archive — archive single (also marks read) (XP-105) */
notificationsRouter.patch('/:id/archive', async (req, res) => {
  const ctx = getAuth(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  await notifications.markArchived(ctx, id);
  res.json({ ok: true });
});

/** PATCH /v1/notifications/:id/unarchive — restore from archive (XP-105) */
notificationsRouter.patch('/:id/unarchive', async (req, res) => {
  const ctx = getAuth(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  await notifications.markUnarchived(ctx, id);
  res.json({ ok: true });
});

/** POST /v1/notifications/mark-all-read — mark all as read */
notificationsRouter.post('/mark-all-read', async (req, res) => {
  const ctx = getAuth(req);
  const count = await notifications.markAllRead(ctx);
  res.json({ marked: count });
});

const prefsSchema = z.object({
  mention: z.boolean().optional(),
  assigned: z.boolean().optional(),
  stateChange: z.boolean().optional(),
  comment: z.boolean().optional(),
  dueSoon: z.boolean().optional(),
  emailDigest: z.enum(['none', 'daily', 'weekly']).optional(),
});

notificationsRouter.get('/preferences', async (req, res) => {
  const ctx = getAuth(req);
  const prefs = await notifications.getNotificationPreferences(ctx);
  res.json(toPrefsJson(prefs));
});

notificationsRouter.patch('/preferences', async (req, res) => {
  const ctx = getAuth(req);
  const input = prefsSchema.parse(req.body);
  const prefs = await notifications.updateNotificationPreferences(ctx, input);
  res.json(toPrefsJson(prefs));
});

function toPrefsJson(p: notifications.NotificationPreferencesRow) {
  return {
    mention: p.mention,
    assigned: p.assigned,
    stateChange: p.state_change,
    comment: p.comment,
    dueSoon: p.due_soon,
    emailDigest: p.email_digest,
  };
}

function toNotificationJson(n: notifications.NotificationRow & { issue_key?: string | null }) {
  return {
    id: n.id,
    workspaceId: n.workspace_id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    body: n.body,
    issueId: n.issue_id,
    issueKey: n.issue_key ?? null,
    commentId: n.comment_id,
    actorId: n.actor_id,
    readAt: n.read_at,
    archivedAt: n.archived_at,
    createdAt: n.created_at,
  };
}
