import { type IssueActivityRow, getIssueByKey, listIssueActivity } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const activityRouter: Router = Router();

activityRouter.use(requireFullAuth);

activityRouter.get('/:key/activity', async (req, res) => {
  const key = String(req.params.key);
  const limitStr = req.query.limit;
  const cursorStr = req.query.cursor;
  const limit = typeof limitStr === 'string' ? Number.parseInt(limitStr, 10) : undefined;
  const cursor = typeof cursorStr === 'string' ? cursorStr : undefined;
  const issue = await getIssueByKey(getAuth(req), key);
  const entries = await listIssueActivity(getAuth(req), issue.id, { limit, cursor });
  const nextCursor =
    entries.length > 0 ? entries[entries.length - 1]!.created_at.toISOString() : null;
  res.json({
    activity: entries.map(toActivityJson),
    nextCursor,
  });
});

function toActivityJson(e: IssueActivityRow) {
  return {
    id: e.id,
    issueId: e.issue_id,
    actorId: e.actor_id,
    actorDisplayName: e.actor_display_name,
    actorEmail: e.actor_email,
    actorAvatarUrl: e.actor_avatar_url,
    action: e.action,
    oldValue: e.old_value,
    newValue: e.new_value,
    createdAt: e.created_at,
  };
}
