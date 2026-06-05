import { slack } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const slackRouter: Router = Router();

const createSchema = z.object({
  teamId: z.string().min(1),
  teamName: z.string().optional(),
  channelId: z.string().min(1),
  channelName: z.string().optional(),
  webhookUrl: z.string().url(),
  botToken: z.string().optional(),
});

const updateSchema = z.object({
  active: z.boolean().optional(),
  notifyIssueCreated: z.boolean().optional(),
  notifyIssueCompleted: z.boolean().optional(),
  notifyComment: z.boolean().optional(),
});

slackRouter.get('/integrations', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const rows = await slack.listSlackIntegrations(ctx);
  res.json({
    integrations: rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      teamName: r.team_name,
      channelId: r.channel_id,
      channelName: r.channel_name,
      active: r.active,
      notifyIssueCreated: r.notify_issue_created,
      notifyIssueCompleted: r.notify_issue_completed,
      notifyComment: r.notify_comment,
      createdAt: r.created_at,
    })),
  });
});

slackRouter.post('/integrations', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const input = createSchema.parse(req.body);
  const row = await slack.createSlackIntegration(ctx, input);
  res.status(201).json({
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    channelId: row.channel_id,
    channelName: row.channel_name,
    active: row.active,
    createdAt: row.created_at,
  });
});

slackRouter.patch('/integrations/:id', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const input = updateSchema.parse(req.body);
  const row = await slack.updateSlackIntegration(ctx, String(req.params.id), input);
  res.json({
    id: row.id,
    active: row.active,
    notifyIssueCreated: row.notify_issue_created,
    notifyIssueCompleted: row.notify_issue_completed,
    notifyComment: row.notify_comment,
  });
});

slackRouter.delete('/integrations/:id', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  await slack.deleteSlackIntegration(ctx, String(req.params.id));
  res.json({ ok: true });
});
