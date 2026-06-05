import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type SlackIntegrationRow = {
  id: string;
  workspace_id: string;
  team_id: string;
  team_name: string | null;
  channel_id: string;
  channel_name: string | null;
  webhook_url: string;
  bot_token: string | null;
  active: boolean;
  notify_issue_created: boolean;
  notify_issue_completed: boolean;
  notify_comment: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function assertAdmin(ctx: FullAuthContext) {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can manage Slack integrations');
  }
}

export async function listSlackIntegrations(ctx: FullAuthContext): Promise<SlackIntegrationRow[]> {
  assertAdmin(ctx);
  const { rows } = await tenantPoolQuery<SlackIntegrationRow>(
    ctx.workspace.id,
    `SELECT * FROM slack_integrations WHERE {TENANT} ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createSlackIntegration(
  ctx: FullAuthContext,
  input: {
    teamId: string;
    teamName?: string;
    channelId: string;
    channelName?: string;
    webhookUrl: string;
    botToken?: string;
  },
): Promise<SlackIntegrationRow> {
  assertAdmin(ctx);

  if (!input.webhookUrl.startsWith('https://hooks.slack.com/')) {
    throw new ValidationError('Invalid Slack webhook URL');
  }

  const { rows } = await getPool().query<SlackIntegrationRow>(
    `INSERT INTO slack_integrations (id, workspace_id, team_id, team_name, channel_id, channel_name, webhook_url, bot_token, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [newId(), ctx.workspace.id, input.teamId, input.teamName ?? null, input.channelId, input.channelName ?? null, input.webhookUrl, input.botToken ?? null, ctx.user.id],
  );
  return rows[0]!;
}

export async function updateSlackIntegration(
  ctx: FullAuthContext,
  integrationId: string,
  input: {
    active?: boolean;
    notifyIssueCreated?: boolean;
    notifyIssueCompleted?: boolean;
    notifyComment?: boolean;
  },
): Promise<SlackIntegrationRow> {
  assertAdmin(ctx);

  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.active !== undefined) { params.push(input.active); sets.push(`active = $${params.length}`); }
  if (input.notifyIssueCreated !== undefined) { params.push(input.notifyIssueCreated); sets.push(`notify_issue_created = $${params.length}`); }
  if (input.notifyIssueCompleted !== undefined) { params.push(input.notifyIssueCompleted); sets.push(`notify_issue_completed = $${params.length}`); }
  if (input.notifyComment !== undefined) { params.push(input.notifyComment); sets.push(`notify_comment = $${params.length}`); }

  if (sets.length === 0) throw new ValidationError('No fields to update');

  sets.push('updated_at = now()');
  params.push(integrationId);
  params.push(ctx.workspace.id);

  const { rows } = await getPool().query<SlackIntegrationRow>(
    `UPDATE slack_integrations SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND workspace_id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows[0]) throw new NotFoundError('Slack integration not found');
  return rows[0];
}

export async function deleteSlackIntegration(ctx: FullAuthContext, integrationId: string): Promise<void> {
  assertAdmin(ctx);
  const { rowCount } = await getPool().query(
    `DELETE FROM slack_integrations WHERE id = $1 AND workspace_id = $2`,
    [integrationId, ctx.workspace.id],
  );
  if (rowCount === 0) throw new NotFoundError('Slack integration not found');
}

export async function sendSlackNotification(
  workspaceId: string,
  event: 'issue_created' | 'issue_completed' | 'comment',
  message: { text: string; blocks?: unknown[] },
): Promise<void> {
  const column = event === 'issue_created' ? 'notify_issue_created'
    : event === 'issue_completed' ? 'notify_issue_completed'
    : 'notify_comment';

  const { rows } = await getPool().query<SlackIntegrationRow>(
    `SELECT * FROM slack_integrations WHERE workspace_id = $1 AND active = true AND ${column} = true`,
    [workspaceId],
  );

  for (const integration of rows) {
    try {
      await fetch(integration.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch {
      // Slack notification failures are non-blocking
    }
  }
}
