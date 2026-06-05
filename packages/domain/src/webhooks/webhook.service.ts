import { randomBytes, createHmac } from 'node:crypto';
import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { requireFeature } from '../billing/gate.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { assertPublicHost, assertPublicHttpsUrl } from '../net/ssrf-guard.js';
import type { FullAuthContext } from '../types.js';

export type WebhookRow = {
  id: string;
  workspace_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  description: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type WebhookDeliveryRow = {
  id: string;
  webhook_id: string;
  event: string;
  payload: unknown;
  status: string;
  http_status: number | null;
  response_body: string | null;
  attempts: number;
  max_attempts: number;
  next_retry_at: Date | null;
  created_at: Date;
  completed_at: Date | null;
};

export const WEBHOOK_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'issue.archived',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'project.created',
  'project.updated',
  'label.created',
  'label.updated',
  'user.invited',
  'user.removed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function assertAdmin(ctx: FullAuthContext) {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can manage webhooks');
  }
}

export async function listWebhooks(ctx: FullAuthContext): Promise<WebhookRow[]> {
  assertAdmin(ctx);
  const { rows } = await tenantPoolQuery<WebhookRow>(
    ctx.workspace.id,
    `SELECT * FROM webhooks WHERE {TENANT} ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createWebhook(
  ctx: FullAuthContext,
  input: { url: string; events: string[]; description?: string },
): Promise<WebhookRow> {
  assertAdmin(ctx);
  await requireFeature(ctx, 'webhooks');

  // SSRF guard: https-only and the host must resolve to a public address.
  await assertPublicHttpsUrl(input.url, 'Webhook URL');

  for (const e of input.events) {
    if (!(WEBHOOK_EVENTS as readonly string[]).includes(e)) {
      throw new ValidationError(`Unknown event: ${e}`);
    }
  }
  if (input.events.length === 0) {
    throw new ValidationError('At least one event is required');
  }

  const id = newId();
  const secret = `whsec_${randomBytes(24).toString('hex')}`;

  const { rows } = await getPool().query<WebhookRow>(
    `INSERT INTO webhooks (id, workspace_id, url, secret, events, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, ctx.workspace.id, input.url, secret, input.events, input.description?.trim() || null, ctx.user.id],
  );
  return rows[0]!;
}

export async function updateWebhook(
  ctx: FullAuthContext,
  webhookId: string,
  input: { url?: string; events?: string[]; description?: string | null; active?: boolean },
): Promise<WebhookRow> {
  assertAdmin(ctx);

  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.url !== undefined) {
    // SSRF guard: https-only and the host must resolve to a public address.
    await assertPublicHttpsUrl(input.url, 'Webhook URL');
    params.push(input.url);
    sets.push(`url = $${params.length}`);
  }

  if (input.events !== undefined) {
    for (const e of input.events) {
      if (!(WEBHOOK_EVENTS as readonly string[]).includes(e)) {
        throw new ValidationError(`Unknown event: ${e}`);
      }
    }
    if (input.events.length === 0) {
      throw new ValidationError('At least one event is required');
    }
    params.push(input.events);
    sets.push(`events = $${params.length}`);
  }

  if (input.description !== undefined) {
    params.push(input.description?.trim() || null);
    sets.push(`description = $${params.length}`);
  }

  if (input.active !== undefined) {
    params.push(input.active);
    sets.push(`active = $${params.length}`);
  }

  if (sets.length === 0) {
    throw new ValidationError('No fields to update');
  }

  sets.push('updated_at = now()');
  params.push(webhookId);
  params.push(ctx.workspace.id);

  const { rows } = await getPool().query<WebhookRow>(
    `UPDATE webhooks SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND workspace_id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows[0]) throw new NotFoundError('Webhook not found');
  return rows[0];
}

export async function deleteWebhook(ctx: FullAuthContext, webhookId: string): Promise<void> {
  assertAdmin(ctx);
  const { rowCount } = await getPool().query(
    `DELETE FROM webhooks WHERE id = $1 AND workspace_id = $2`,
    [webhookId, ctx.workspace.id],
  );
  if (rowCount === 0) throw new NotFoundError('Webhook not found');
}

export async function getWebhookDeliveries(
  ctx: FullAuthContext,
  webhookId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<{ deliveries: WebhookDeliveryRow[]; nextCursor: string | null }> {
  assertAdmin(ctx);
  const limit = Math.min(opts?.limit ?? 25, 100);

  const existing = await getPool().query(
    `SELECT id FROM webhooks WHERE id = $1 AND workspace_id = $2`,
    [webhookId, ctx.workspace.id],
  );
  if (!existing.rows[0]) throw new NotFoundError('Webhook not found');

  const params: unknown[] = [webhookId, limit + 1];
  let cursorClause = '';
  if (opts?.cursor) {
    params.push(opts.cursor);
    cursorClause = `AND d.created_at < (SELECT created_at FROM webhook_deliveries WHERE id = $${params.length})`;
  }

  const { rows } = await getPool().query<WebhookDeliveryRow>(
    `SELECT d.* FROM webhook_deliveries d
     WHERE d.webhook_id = $1 ${cursorClause}
     ORDER BY d.created_at DESC
     LIMIT $2`,
    params,
  );

  const hasMore = rows.length > limit;
  const deliveries = hasMore ? rows.slice(0, limit) : rows;
  return {
    deliveries,
    nextCursor: hasMore ? deliveries[deliveries.length - 1]!.id : null,
  };
}

export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function dispatchWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const { rows: webhooks } = await getPool().query<WebhookRow>(
    `SELECT * FROM webhooks WHERE workspace_id = $1 AND active = true AND $2 = ANY(events)`,
    [workspaceId, event],
  );

  if (webhooks.length === 0) return;

  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

  for (const wh of webhooks) {
    const deliveryId = newId();
    await getPool().query(
      `INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, next_retry_at)
       VALUES ($1, $2, $3, $4, 'pending', now())`,
      [deliveryId, wh.id, event, payload],
    );
  }
}

const MAX_WEBHOOK_REDIRECTS = 3;
const MAX_WEBHOOK_RESPONSE_BYTES = 1_000_000;

// POST a webhook payload with SSRF protection: every hop must be https and
// resolve to a public address (re-checked per redirect to defeat DNS rebinding
// and redirect-to-internal), redirects are capped, and the response body is
// bounded so a hostile receiver can't exhaust memory.
async function deliverWebhookRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
): Promise<{ res: Response; body: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_WEBHOOK_REDIRECTS; hop++) {
    const target = new URL(current);
    if (target.protocol !== 'https:') throw new ValidationError('Webhook URL must use HTTPS');
    await assertPublicHost(target.hostname, 'Webhook URL');

    const res = await fetch(current, { method: 'POST', headers, body, signal, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { res, body: '' };
      current = new URL(location, current).toString();
      continue;
    }

    const declaredLength = Number(res.headers.get('content-length') ?? '');
    const tooLarge = Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_RESPONSE_BYTES;
    const text = tooLarge ? '' : await res.text().catch(() => '');
    return { res, body: text };
  }
  throw new ValidationError('Webhook delivery exceeded redirect limit');
}

export async function processWebhookDelivery(deliveryId: string): Promise<void> {
  const { rows } = await getPool().query<WebhookDeliveryRow & { url: string; secret: string }>(
    `SELECT d.*, w.url, w.secret FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     WHERE d.id = $1 AND d.status = 'pending'`,
    [deliveryId],
  );
  const delivery = rows[0];
  if (!delivery) return;

  const payloadStr = typeof delivery.payload === 'string' ? delivery.payload : JSON.stringify(delivery.payload);
  const signature = signPayload(payloadStr, delivery.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const { res, body: resBody } = await deliverWebhookRequest(
      delivery.url,
      {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery': delivery.id,
      },
      payloadStr,
      controller.signal,
    );

    clearTimeout(timeout);

    const newAttempts = delivery.attempts + 1;

    if (res.ok) {
      await getPool().query(
        `UPDATE webhook_deliveries SET status = 'success', http_status = $1, response_body = $2, attempts = $3, completed_at = now() WHERE id = $4`,
        [res.status, resBody.slice(0, 4000), newAttempts, deliveryId],
      );
    } else if (newAttempts >= delivery.max_attempts) {
      await getPool().query(
        `UPDATE webhook_deliveries SET status = 'failed', http_status = $1, response_body = $2, attempts = $3, completed_at = now() WHERE id = $4`,
        [res.status, resBody.slice(0, 4000), newAttempts, deliveryId],
      );
    } else {
      const backoff = Math.min(30 * 60, 60 * 2 ** (newAttempts - 1));
      await getPool().query(
        `UPDATE webhook_deliveries SET http_status = $1, response_body = $2, attempts = $3, next_retry_at = now() + interval '1 second' * $4 WHERE id = $5`,
        [res.status, resBody.slice(0, 4000), newAttempts, backoff, deliveryId],
      );
    }
  } catch (err) {
    const newAttempts = delivery.attempts + 1;
    const errMsg = err instanceof Error ? err.message : 'Unknown error';

    if (newAttempts >= delivery.max_attempts) {
      await getPool().query(
        `UPDATE webhook_deliveries SET status = 'failed', response_body = $1, attempts = $2, completed_at = now() WHERE id = $3`,
        [errMsg.slice(0, 4000), newAttempts, deliveryId],
      );
    } else {
      const backoff = Math.min(30 * 60, 60 * 2 ** (newAttempts - 1));
      await getPool().query(
        `UPDATE webhook_deliveries SET response_body = $1, attempts = $2, next_retry_at = now() + interval '1 second' * $3 WHERE id = $4`,
        [errMsg.slice(0, 4000), newAttempts, backoff, deliveryId],
      );
    }
  }
}

// Lease window: a claimed delivery's next_retry_at is pushed this far into the
// future so no other ticker re-selects it. If processing crashes mid-flight,
// the row becomes eligible again after the lease expires (crash recovery).
const DELIVERY_LEASE_SECONDS = 60;

export async function processPendingDeliveries(): Promise<number> {
  // Atomically claim due deliveries. FOR UPDATE SKIP LOCKED lets concurrent
  // tickers (multiple API replicas, or API + a dedicated worker) each grab a
  // disjoint batch instead of all POSTing the same rows — which previously
  // caused duplicate webhook deliveries. We "lease" by bumping next_retry_at
  // forward rather than introducing a 'processing' status, so the existing
  // pending-based delivery + retry logic is unchanged.
  const { rows } = await getPool().query<{ id: string }>(
    `UPDATE webhook_deliveries
     SET next_retry_at = now() + interval '1 second' * $1
     WHERE id IN (
       SELECT id FROM webhook_deliveries
       WHERE status = 'pending' AND next_retry_at <= now()
       ORDER BY next_retry_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [DELIVERY_LEASE_SECONDS],
  );
  for (const row of rows) {
    await processWebhookDelivery(row.id);
  }
  return rows.length;
}
