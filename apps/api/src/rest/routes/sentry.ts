import { getPool } from '@xpntl/db';
import { sentry } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const sentryRouter: Router = Router();

const createSchema = z.object({
  dsnProject: z.string().min(1),
  projectId: z.string().min(1),
});

sentryRouter.get('/integrations', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const rows = await sentry.listSentryIntegrations(ctx);
  res.json({
    integrations: rows.map((r) => ({
      id: r.id,
      dsnProject: r.dsn_project,
      projectId: r.project_id,
      webhookSecret: r.webhook_secret,
      autoCreate: r.auto_create,
      active: r.active,
      createdAt: r.created_at,
    })),
  });
});

sentryRouter.post('/integrations', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const input = createSchema.parse(req.body);
  const row = await sentry.createSentryIntegration(ctx, input);
  res.status(201).json({
    id: row.id,
    dsnProject: row.dsn_project,
    projectId: row.project_id,
    webhookSecret: row.webhook_secret,
    active: row.active,
    createdAt: row.created_at,
  });
});

sentryRouter.delete('/integrations/:id', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  await sentry.deleteSentryIntegration(ctx, String(req.params.id));
  res.json({ ok: true });
});

sentryRouter.post('/webhook', async (req, res) => {
  const signature = req.headers['sentry-hook-signature'];
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing signature header' });
    return;
  }

  const resource = req.headers['sentry-hook-resource'];
  if (resource !== 'issue') {
    res.status(200).json({ ignored: true });
    return;
  }

  const body = req.body;
  const projectSlug = body?.data?.issue?.project?.slug;
  if (!projectSlug) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const { rows } = await getPool().query<{ webhook_secret: string }>(
    'SELECT webhook_secret FROM sentry_integrations WHERE dsn_project = $1 AND active = true LIMIT 1',
    [projectSlug],
  );
  if (!rows[0]) {
    res.status(200).json({ ignored: true, reason: 'no matching integration' });
    return;
  }

  const rawBody = JSON.stringify(body);
  if (!sentry.verifySentrySignature(rawBody, signature, rows[0].webhook_secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  await sentry.handleSentryWebhook(body);
  res.json({ ok: true });
});
