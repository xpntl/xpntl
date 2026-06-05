import { getPool, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { canCreateIssue } from '../authz.js';
import { requireFeature } from '../billing/gate.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, ProjectRow, WorkflowStateRow } from '../types.js';
import type { ImportJobRow } from './csv-import.service.js';

// ---- GitHub API types ------------------------------------------------------

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string } | string>;
  created_at: string;
  updated_at: string;
  // Present only on pull requests, which the issues endpoint also returns.
  pull_request?: unknown;
};

const GITHUB_API = 'https://api.github.com';

async function githubFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'xpntl-import',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new ValidationError('GitHub token is invalid or expired');
    if (res.status === 404) throw new ValidationError('Repository not found, or the token lacks access');
    if (res.status === 403) throw new ValidationError('GitHub rate limit hit or access forbidden — try again shortly');
    throw new ValidationError(`GitHub API error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Validate repo + token by reading repo metadata. owner/repo from "owner/repo". */
export async function getGithubRepo(input: {
  repo: string;
  token: string;
}): Promise<{ fullName: string; openIssues: number }> {
  const slug = input.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!/^[^/]+\/[^/]+$/.test(slug)) {
    throw new ValidationError('Repository must be in "owner/repo" form');
  }
  const repo = await githubFetch<{ full_name: string; open_issues_count: number }>(
    input.token,
    `/repos/${slug}`,
  );
  return { fullName: repo.full_name, openIssues: repo.open_issues_count };
}

export async function startGithubImport(
  ctx: FullAuthContext,
  input: { repo: string; token: string; projectId: string },
): Promise<ImportJobRow> {
  if (!canCreateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to import issues');
  }
  await requireFeature(ctx, 'csv_import');

  const slug = input.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!/^[^/]+\/[^/]+$/.test(slug) || !input.token) {
    throw new ValidationError('A repo ("owner/repo") and a GitHub token are required');
  }

  const { rows: projects } = await tenantPoolQuery<ProjectRow>(
    ctx.workspace.id,
    `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
    [input.projectId],
  );
  if (!projects[0]) throw new NotFoundError('Project not found');

  // Validate up front so the user gets immediate feedback on a bad repo/token.
  await getGithubRepo({ repo: slug, token: input.token });

  const jobId = newId();
  const { rows: jobs } = await getPool().query<ImportJobRow>(
    `INSERT INTO import_jobs (id, workspace_id, project_id, filename, total_rows, field_mapping, created_by)
     VALUES ($1, $2, $3, $4, 0, $5, $6)
     RETURNING *`,
    [
      jobId,
      ctx.workspace.id,
      input.projectId,
      `github-${slug}`,
      JSON.stringify({ source: 'github', repo: slug }),
      ctx.user.id,
    ],
  );

  processGithubImport(ctx, jobs[0]!.id, { repo: slug, token: input.token, projectId: input.projectId }).catch(
    () => {},
  );

  return jobs[0]!;
}

// ---- Background processing -------------------------------------------------

async function processGithubImport(
  ctx: FullAuthContext,
  jobId: string,
  input: { repo: string; token: string; projectId: string },
): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE import_jobs SET status = 'processing' WHERE id = $1`, [jobId]);

  try {
    const statesResult = await tenantPoolQuery<WorkflowStateRow>(
      ctx.workspace.id,
      `SELECT * FROM workflow_states WHERE {TENANT} ORDER BY position ASC`,
    );
    const stateByType = new Map<string, WorkflowStateRow>();
    for (const s of statesResult.rows) if (!stateByType.has(s.type)) stateByType.set(s.type, s);
    const openState = stateByType.get('unstarted') ?? stateByType.get('backlog') ?? statesResult.rows[0];
    const doneState = stateByType.get('completed') ?? openState;

    const projectResult = await pool.query<ProjectRow>(`SELECT * FROM projects WHERE id = $1`, [
      input.projectId,
    ]);
    const project = projectResult.rows[0]!;

    const labelCache = new Map<string, string>();
    const existingLabels = await tenantPoolQuery<{ id: string; name: string }>(
      ctx.workspace.id,
      `SELECT id, name FROM labels WHERE {TENANT}`,
    );
    for (const l of existingLabels.rows) labelCache.set(l.name.toLowerCase(), l.id);

    // Paginate the issues endpoint (state=all). It also returns PRs, which we skip.
    const allIssues: GitHubIssue[] = [];
    for (let page = 1; page <= 50; page++) {
      const batch = await githubFetch<GitHubIssue[]>(
        input.token,
        `/repos/${input.repo}/issues?state=all&per_page=100&page=${page}&sort=created&direction=asc`,
      );
      allIssues.push(...batch.filter((i) => !i.pull_request));
      if (batch.length < 100) break;
    }

    await pool.query(`UPDATE import_jobs SET total_rows = $1 WHERE id = $2`, [allIssues.length, jobId]);

    let imported = 0;
    let failed = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < allIssues.length; i++) {
      const gh = allIssues[i]!;
      try {
        const title = gh.title?.trim();
        if (!title) {
          errors.push({ row: i + 1, message: `#${gh.number}: empty title` });
          failed++;
          continue;
        }

        const stateId = (gh.state === 'closed' ? doneState : openState)?.id;

        // Ensure labels exist; collect IDs.
        const labelIds: string[] = [];
        for (const raw of gh.labels ?? []) {
          const name = typeof raw === 'string' ? raw : raw.name;
          if (!name) continue;
          const key = name.toLowerCase();
          let labelId = labelCache.get(key);
          if (!labelId) {
            try {
              await pool.query(
                `INSERT INTO labels (id, workspace_id, name, color)
                 VALUES ($1, $2, $3, '#6B7280')
                 ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name`,
                [newId(), ctx.workspace.id, name],
              );
              const { rows: lrows } = await pool.query<{ id: string }>(
                `SELECT id FROM labels WHERE workspace_id = $1 AND lower(name) = lower($2)`,
                [ctx.workspace.id, name],
              );
              if (lrows[0]) {
                labelId = lrows[0].id;
                labelCache.set(key, labelId);
              }
            } catch {
              /* skip label on failure */
            }
          }
          if (labelId) labelIds.push(labelId);
        }

        const issueId = newId();
        const createdAt = new Date(gh.created_at);
        const updatedAt = new Date(gh.updated_at);

        await withTransaction(async (client) => {
          const counter = await client.query<{ last_key: number }>(
            `INSERT INTO project_key_counters (project_id, last_key)
             VALUES ($1, 1)
             ON CONFLICT (project_id) DO UPDATE SET last_key = project_key_counters.last_key + 1
             RETURNING last_key`,
            [project.id],
          );
          const key = `${project.key}-${counter.rows[0]!.last_key}`;

          await client.query(
            `INSERT INTO issues
               (id, workspace_id, key, title, description, state_id, priority,
                assignee_id, creator_id, project_id, sort_order, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 0, NULL, $7, $8,
                     extract(epoch FROM now()), $9, $10)`,
            [
              issueId,
              ctx.workspace.id,
              key,
              title,
              gh.body?.trim() || null,
              stateId,
              ctx.user.id,
              project.id,
              createdAt,
              updatedAt,
            ],
          );

          for (const labelId of labelIds) {
            await client.query(
              `INSERT INTO issue_labels (workspace_id, issue_id, label_id, attached_by)
               VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
              [ctx.workspace.id, issueId, labelId, ctx.user.id],
            );
          }
        });

        imported++;
        if (imported % 10 === 0) {
          await pool.query(`UPDATE import_jobs SET imported_rows = $1 WHERE id = $2`, [imported, jobId]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ row: i + 1, message: `#${gh.number}: ${msg}` });
        failed++;
      }
    }

    await pool.query(
      `UPDATE import_jobs
          SET status = 'completed', imported_rows = $1, failed_rows = $2, errors = $3, completed_at = now()
        WHERE id = $4`,
      [imported, failed, JSON.stringify(errors), jobId],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `UPDATE import_jobs SET status = 'failed', errors = $1, completed_at = now() WHERE id = $2`,
      [JSON.stringify([{ row: 0, message: msg }]), jobId],
    );
  }
}
