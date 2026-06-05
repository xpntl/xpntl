import { audit } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const auditRouter: Router = Router();

auditRouter.use(requireFullAuth);

auditRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const entries = await audit.queryAuditLog(ctx, {
    eventType: req.query.eventType ? String(req.query.eventType) : undefined,
    targetType: req.query.targetType ? String(req.query.targetType) : undefined,
    actorId: req.query.actorId ? String(req.query.actorId) : undefined,
    limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined,
    cursor: req.query.cursor ? String(req.query.cursor) : undefined,
  });

  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      workspaceId: e.workspace_id,
      actorUserId: e.actor_user_id,
      eventType: e.event_type,
      targetType: e.target_type,
      targetId: e.target_id,
      metadata: e.metadata,
      createdAt: e.created_at,
      ip: e.ip,
      userAgent: e.user_agent,
    })),
  });
});
