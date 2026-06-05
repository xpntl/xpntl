import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { requireFeature } from '../billing/gate.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, IssueRow } from '../types.js';

export type GitHubIntegrationRow = {
  id: string;
  workspace_id: string;
  installation_id: number | null;
  owner: string;
  repo: string;
  webhook_secret: string;
  active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type IssuePrLinkRow = {
  id: string;
  workspace_id: string;
  issue_id: string;
  pr_number: number;
  pr_url: string;
  pr_title: string | null;
  repo_owner: string;
  repo_name: string;
  status: 'open' | 'merged' | 'closed';
  auto_close: boolean;
  created_at: Date;
  updated_at: Date;
};

function assertAdmin(ctx: FullAuthContext) {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can manage GitHub integrations');
  }
}

export async function listIntegrations(ctx: FullAuthContext): Promise<GitHubIntegrationRow[]> {
  assertAdmin(ctx);
  const { rows } = await tenantPoolQuery<GitHubIntegrationRow>(
    ctx.workspace.id,
    `SELECT * FROM github_integrations WHERE {TENANT} ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createIntegration(
  ctx: FullAuthContext,
  input: { owner: string; repo: string; installationId?: number },
): Promise<GitHubIntegrationRow> {
  assertAdmin(ctx);
  await requireFeature(ctx, 'github_integration');

  if (!input.owner || !input.repo) {
    throw new ValidationError('owner and repo are required');
  }

  const secret = `ghsec_${randomBytes(24).toString('hex')}`;
  const { rows } = await getPool().query<GitHubIntegrationRow>(
    `INSERT INTO github_integrations (id, workspace_id, installation_id, owner, repo, webhook_secret, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [newId(), ctx.workspace.id, input.installationId ?? null, input.owner, input.repo, secret, ctx.user.id],
  );
  return rows[0]!;
}

export async function deleteIntegration(ctx: FullAuthContext, integrationId: string): Promise<void> {
  assertAdmin(ctx);
  const { rowCount } = await getPool().query(
    `DELETE FROM github_integrations WHERE id = $1 AND workspace_id = $2`,
    [integrationId, ctx.workspace.id],
  );
  if (rowCount === 0) throw new NotFoundError('Integration not found');
}

export async function listPrLinks(ctx: FullAuthContext, issueKey: string): Promise<IssuePrLinkRow[]> {
  const { rows: issues } = await tenantPoolQuery<IssueRow>(
    ctx.workspace.id,
    `SELECT id FROM issues WHERE {TENANT} AND key = $1`,
    [issueKey],
  );
  if (!issues[0]) throw new NotFoundError(`Issue ${issueKey} not found`);

  const { rows } = await getPool().query<IssuePrLinkRow>(
    `SELECT * FROM issue_pr_links WHERE issue_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
    [issues[0].id, ctx.workspace.id],
  );
  return rows;
}

const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

export function extractIssueKeys(text: string): string[] {
  const matches = text.match(ISSUE_KEY_RE);
  return matches ? [...new Set(matches)] : [];
}

export function verifyGitHubSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// All active integrations for a repo, across workspaces. The webhook receiver
// verifies the signature against EACH integration's own secret, so a payload
// signed for one workspace can't be processed under another's integration.
export async function listActiveIntegrationsByRepo(
  owner: string,
  repo: string,
): Promise<GitHubIntegrationRow[]> {
  const { rows } = await getPool().query<GitHubIntegrationRow>(
    'SELECT * FROM github_integrations WHERE owner = $1 AND repo = $2 AND active = true',
    [owner, repo],
  );
  return rows;
}

type PullRequestEventPayload = {
  action: string;
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    body: string | null;
    merged: boolean;
    head: { ref: string };
  };
  repository: {
    owner: { login: string };
    name: string;
  };
};

export async function handlePullRequestEvent(payload: PullRequestEventPayload): Promise<void> {
  const { repository: repo } = payload;
  const integrations = await listActiveIntegrationsByRepo(repo.owner.login, repo.name);
  for (const integration of integrations) {
    await handlePullRequestEventForIntegration(integration, payload);
  }
}

// Apply a PR event to a SINGLE integration's workspace. The caller is
// responsible for having verified the webhook signature against this
// integration's own secret, so mutations stay scoped to the verified workspace.
export async function handlePullRequestEventForIntegration(
  integration: GitHubIntegrationRow,
  payload: PullRequestEventPayload,
): Promise<void> {
  const { action, pull_request: pr, repository: repo } = payload;
  const owner = repo.owner.login;
  const repoName = repo.name;
  const wsId = integration.workspace_id;

  const textToSearch = [pr.title, pr.body ?? '', pr.head.ref].join(' ');
  const issueKeys = extractIssueKeys(textToSearch);
  if (issueKeys.length === 0) return;

  for (const key of issueKeys) {
    const { rows: issues } = await getPool().query<IssueRow>(
      `SELECT id FROM issues WHERE workspace_id = $1 AND key = $2 AND deleted_at IS NULL`,
      [wsId, key],
    );
    if (!issues[0]) continue;

    if (action === 'opened' || action === 'reopened') {
      await getPool().query(
        `INSERT INTO issue_pr_links (id, workspace_id, issue_id, pr_number, pr_url, pr_title, repo_owner, repo_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
         ON CONFLICT (workspace_id, issue_id, pr_url) DO UPDATE SET status = 'open', pr_title = $6, updated_at = now()`,
        [newId(), wsId, issues[0].id, pr.number, pr.html_url, pr.title, owner, repoName],
      );
    } else if (action === 'closed') {
      const status = pr.merged ? 'merged' : 'closed';
      await getPool().query(
        `UPDATE issue_pr_links SET status = $1, updated_at = now()
         WHERE workspace_id = $2 AND issue_id = $3 AND pr_url = $4`,
        [status, wsId, issues[0].id, pr.html_url],
      );

      if (pr.merged) {
        const { rows: links } = await getPool().query<IssuePrLinkRow>(
          `SELECT * FROM issue_pr_links WHERE workspace_id = $1 AND issue_id = $2 AND pr_url = $3`,
          [wsId, issues[0].id, pr.html_url],
        );
        if (links[0]?.auto_close) {
          const doneState = await getPool().query<{ id: string }>(
            `SELECT ws.id FROM workflow_states ws
             WHERE ws.workspace_id = $1 AND ws.type = 'completed'
             ORDER BY ws.position ASC LIMIT 1`,
            [wsId],
          );
          if (doneState.rows[0]) {
            await getPool().query(
              `UPDATE issues SET state_id = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
              [doneState.rows[0].id, issues[0].id, wsId],
            );
          }
        }
      }
    }
  }
}
