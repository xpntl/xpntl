import { webhooks } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const webhooksRouter: Router = Router();

webhooksRouter.use(requireFullAuth);

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().max(500).optional(),
});

const updateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  description: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});

webhooksRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const rows = await webhooks.listWebhooks(ctx);
  res.json({ webhooks: rows.map(toWebhookJson) });
});

webhooksRouter.post('/', async (req, res) => {
  const ctx = getAuth(req);
  const input = createSchema.parse(req.body);
  const row = await webhooks.createWebhook(ctx, input);
  res.status(201).json(toWebhookJson(row));
});

webhooksRouter.patch('/:id', async (req, res) => {
  const ctx = getAuth(req);
  const input = updateSchema.parse(req.body);
  const row = await webhooks.updateWebhook(ctx, req.params.id!, input);
  res.json(toWebhookJson(row));
});

webhooksRouter.delete('/:id', async (req, res) => {
  const ctx = getAuth(req);
  await webhooks.deleteWebhook(ctx, req.params.id!);
  res.json({ ok: true });
});

webhooksRouter.get('/:id/deliveries', async (req, res) => {
  const ctx = getAuth(req);
  const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const result = await webhooks.getWebhookDeliveries(ctx, req.params.id!, { limit, cursor });
  res.json({
    deliveries: result.deliveries.map(toDeliveryJson),
    nextCursor: result.nextCursor,
  });
});

function toWebhookJson(w: webhooks.WebhookRow) {
  return {
    id: w.id,
    workspaceId: w.workspace_id,
    url: w.url,
    events: w.events,
    active: w.active,
    description: w.description,
    createdBy: w.created_by,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

function toDeliveryJson(d: webhooks.WebhookDeliveryRow) {
  return {
    id: d.id,
    webhookId: d.webhook_id,
    event: d.event,
    payload: d.payload,
    status: d.status,
    httpStatus: d.http_status,
    responseBody: d.response_body,
    attempts: d.attempts,
    maxAttempts: d.max_attempts,
    nextRetryAt: d.next_retry_at,
    createdAt: d.created_at,
    completedAt: d.completed_at,
  };
}
