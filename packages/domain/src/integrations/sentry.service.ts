import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, IssueRow, ProjectRow, WorkflowStateRow } from '../types.js';

export type SentryIntegrationRow = {
  id: string;
  workspace_id: string;
  dsn_project: string;
  project_id: string;
  webhook_secret: string;
  auto_create: boolean;
  active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function assertAdmin(ctx: FullAuthContext) {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can manage Sentry integrations');
  }
}

export async function listSentryIntegrations(ctx: FullAuthContext): Promise<SentryIntegrationRow[]> {
  assertAdmin(ctx);
  const { rows } = await tenantPoolQuery<SentryIntegrationRow>(
    ctx.workspace.id,
    `SELECT * FROM sentry_integrations WHERE {TENANT} ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createSentryIntegration(
  ctx: FullAuthContext,
  input: { dsnProject: string; projectId: string },
): Promise<SentryIntegrationRow> {
  assertAdmin(ctx);

  const { rows: projects } = await tenantPoolQuery<ProjectRow>(
    ctx.workspace.id,
    `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
    [input.projectId],
  );
  if (!projects[0]) throw new NotFoundError('Project not found');

  const secret = `sentry_${randomBytes(24).toString('hex')}`;
  const { rows } = await getPool().query<SentryIntegrationRow>(
    `INSERT INTO sentry_integrations (id, workspace_id, dsn_project, project_id, webhook_secret, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [newId(), ctx.workspace.id, input.dsnProject, input.projectId, secret, ctx.user.id],
  );
  return rows[0]!;
}

export async function deleteSentryIntegration(ctx: FullAuthContext, integrationId: string): Promise<void> {
  assertAdmin(ctx);
  const { rowCount } = await getPool().query(
    `DELETE FROM sentry_integrations WHERE id = $1 AND workspace_id = $2`,
    [integrationId, ctx.workspace.id],
  );
  if (rowCount === 0) throw new NotFoundError('Sentry integration not found');
}

export function verifySentrySignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleSentryWebhook(payload: {
  action: string;
  data: {
    issue: {
      id: string;
      title: string;
      culprit: string;
      shortId: string;
      metadata: { type?: string; value?: string };
      project: { slug: string; id: number };
    };
  };
  installation?: { uuid: string };
}): Promise<void> {
  if (payload.action !== 'created') return;

  const issue = payload.data.issue;
  const projectSlug = issue.project.slug;

  const { rows: integrations } = await getPool().query<SentryIntegrationRow>(
    `SELECT * FROM sentry_integrations WHERE dsn_project = $1 AND active = true AND auto_create = true`,
    [projectSlug],
  );

  for (const integration of integrations) {
    await withTransaction(async (client) => {
      const existing = await client.query<IssueRow>(
        `SELECT id FROM issues WHERE workspace_id = $1 AND title LIKE $2 AND deleted_at IS NULL LIMIT 1`,
        [integration.workspace_id, `[Sentry] ${issue.title}%`],
      );
      if (existing.rows[0]) return;

      const counterResult = await client.query<{ last_key: number }>(
        `INSERT INTO project_key_counters (project_id, last_key)
         VALUES ($1, 1)
         ON CONFLICT (project_id)
         DO UPDATE SET last_key = project_key_counters.last_key + 1
         RETURNING last_key`,
        [integration.project_id],
      );

      const projectResult = await client.query<ProjectRow>(
        `SELECT key FROM projects WHERE id = $1`,
        [integration.project_id],
      );
      const projectKey = projectResult.rows[0]?.key ?? 'UNK';
      const key = `${projectKey}-${counterResult.rows[0]!.last_key}`;

      const stateResult = await client.query<WorkflowStateRow>(
        `SELECT id FROM workflow_states WHERE workspace_id = $1 AND type = 'unstarted' ORDER BY position ASC LIMIT 1`,
        [integration.workspace_id],
      );
      const stateId = stateResult.rows[0]?.id;

      const title = `[Sentry] ${issue.title}`;
      const description = [
        `**Sentry Issue:** ${issue.shortId}`,
        issue.culprit ? `**Culprit:** ${issue.culprit}` : null,
        issue.metadata.type ? `**Type:** ${issue.metadata.type}` : null,
        issue.metadata.value ? `**Value:** ${issue.metadata.value}` : null,
      ].filter(Boolean).join('\n');

      await client.query(
        `INSERT INTO issues (id, workspace_id, key, title, description, state_id, priority, project_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, extract(epoch FROM now()))`,
        [newId(), integration.workspace_id, key, title, description, stateId, 2, integration.project_id],
      );
    });
  }
}
