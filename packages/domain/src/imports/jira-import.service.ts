import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { requireFeature } from '../billing/gate.js';
import { canCreateIssue } from '../authz.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { assertPublicHost, isIpLiteral, isPrivateAddress } from '../net/ssrf-guard.js';
import type { FullAuthContext, ProjectRow, WorkflowStateRow, UserRow } from '../types.js';
import type { ImportJobRow } from './csv-import.service.js';

// ---- Jira API types --------------------------------------------------------

type JiraProject = {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
};

type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: AdfDoc | null;
    status: {
      statusCategory: {
        key: string; // 'new' | 'indeterminate' | 'done'
      };
    };
    priority: { name: string } | null;
    assignee: { accountId: string; emailAddress?: string; displayName: string } | null;
    labels: string[];
    created: string;
    updated: string;
    comment: {
      comments: JiraComment[];
    };
  };
};

type JiraComment = {
  id: string;
  author: { accountId: string; emailAddress?: string; displayName: string };
  body: AdfDoc | string;
  created: string;
};

// ---- ADF types -------------------------------------------------------------

type AdfDoc = {
  type: 'doc';
  version?: number;
  content?: AdfNode[];
};

type AdfNode = {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

// ---- ADF → HTML converter --------------------------------------------------

function adfToHtml(node: AdfDoc | AdfNode | null | undefined): string {
  if (!node) return '';

  // Handle plain string (older Jira comment format)
  if (typeof node === 'string') return escapeHtml(node);

  switch (node.type) {
    case 'doc': {
      const children = (node.content ?? []).map(adfToHtml).join('');
      return children;
    }
    case 'paragraph': {
      const inner = (node.content ?? []).map(adfToHtml).join('');
      if (!inner) return '<p></p>';
      return `<p>${inner}</p>`;
    }
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const inner = (node.content ?? []).map(adfToHtml).join('');
      return `<h${level}>${inner}</h${level}>`;
    }
    case 'text': {
      let text = escapeHtml(node.text ?? '');
      for (const mark of node.marks ?? []) {
        switch (mark.type) {
          case 'strong':
            text = `<strong>${text}</strong>`;
            break;
          case 'em':
            text = `<em>${text}</em>`;
            break;
          case 'code':
            text = `<code>${text}</code>`;
            break;
          case 'strike':
            text = `<s>${text}</s>`;
            break;
          case 'underline':
            text = `<u>${text}</u>`;
            break;
          case 'link': {
            const href = escapeHtml(String(mark.attrs?.href ?? '#'));
            text = `<a href="${href}">${text}</a>`;
            break;
          }
        }
      }
      return text;
    }
    case 'hardBreak':
      return '<br>';
    case 'bulletList': {
      const items = (node.content ?? []).map(adfToHtml).join('');
      return `<ul>${items}</ul>`;
    }
    case 'orderedList': {
      const start = (node.attrs?.order as number) ?? 1;
      const items = (node.content ?? []).map(adfToHtml).join('');
      return `<ol start="${start}">${items}</ol>`;
    }
    case 'listItem': {
      const inner = (node.content ?? []).map(adfToHtml).join('');
      return `<li>${inner}</li>`;
    }
    case 'codeBlock': {
      const lang = node.attrs?.language ? ` class="language-${escapeHtml(String(node.attrs.language))}"` : '';
      const inner = (node.content ?? []).map((c) => escapeHtml(c.text ?? '')).join('');
      return `<pre><code${lang}>${inner}</code></pre>`;
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map(adfToHtml).join('');
      return `<blockquote>${inner}</blockquote>`;
    }
    case 'mention': {
      const name = escapeHtml(String(node.attrs?.text ?? node.attrs?.id ?? 'mention'));
      return `<span data-type="mention">@${name}</span>`;
    }
    case 'inlineCard': {
      const url = escapeHtml(String(node.attrs?.url ?? '#'));
      return `<a href="${url}">${url}</a>`;
    }
    case 'mediaSingle': {
      // Jira media references — emit a placeholder link
      const inner = (node.content ?? []).map(adfToHtml).join('');
      return inner || '';
    }
    case 'media': {
      const alt = escapeHtml(String(node.attrs?.alt ?? 'attachment'));
      return `<p><em>[Attachment: ${alt}]</em></p>`;
    }
    case 'rule':
      return '<hr>';
    case 'table': {
      const rows = (node.content ?? []).map(adfToHtml).join('');
      return `<table>${rows}</table>`;
    }
    case 'tableRow': {
      const cells = (node.content ?? []).map(adfToHtml).join('');
      return `<tr>${cells}</tr>`;
    }
    case 'tableHeader': {
      const inner = (node.content ?? []).map(adfToHtml).join('');
      return `<th>${inner}</th>`;
    }
    case 'tableCell': {
      const inner = (node.content ?? []).map(adfToHtml).join('');
      return `<td>${inner}</td>`;
    }
    default:
      // Unknown node — render children if any
      return (node.content ?? []).map(adfToHtml).join('');
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Priority mapping ------------------------------------------------------

function mapJiraPriority(name: string | null | undefined): number {
  if (!name) return 0;
  switch (name.toLowerCase()) {
    case 'highest':
      return 1;
    case 'high':
      return 2;
    case 'medium':
      return 3;
    case 'low':
    case 'lowest':
      return 4;
    default:
      return 0;
  }
}

// ---- Status category → xpntl state type mapping ---------------------------

function mapJiraStatusCategory(key: string): 'unstarted' | 'started' | 'completed' {
  switch (key) {
    case 'indeterminate':
      return 'started';
    case 'done':
      return 'completed';
    default: // 'new' and anything else
      return 'unstarted';
  }
}

// ---- Jira REST API helpers -------------------------------------------------

function jiraAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
}

function normalizeJiraUrl(url: string): string {
  // Accept both "mycompany.atlassian.net" and "https://mycompany.atlassian.net"
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Invalid Jira URL');
  }
  // SSRF guard: only allow https to a real external host. http/file/gopher etc.
  // and IP-literal hosts are rejected outright; DNS-resolved targets are
  // re-checked at fetch time (assertPublicHost) to defeat DNS rebinding.
  if (parsed.protocol !== 'https:') {
    throw new ValidationError('Jira URL must use https');
  }
  if (isIpLiteral(parsed.hostname) && isPrivateAddress(parsed.hostname)) {
    throw new ValidationError('Jira URL host is not allowed');
  }
  return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, '');
}

const MAX_REDIRECTS = 5;

async function jiraFetch<T>(
  jiraUrl: string,
  path: string,
  email: string,
  apiToken: string,
): Promise<T> {
  const base = normalizeJiraUrl(jiraUrl);
  let url = `${base}${path}`;
  const origin = new URL(base).origin;

  // Follow redirects manually: a public Jira host could 3xx-redirect to an
  // internal target (169.254.169.254, etc.), bypassing the up-front host
  // check. Re-validate every hop and drop the Authorization header on any
  // cross-origin redirect so credentials never leak to another host.
  let res: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = new URL(url);
    if (target.protocol !== 'https:') {
      throw new ValidationError('Jira redirect to a non-https URL');
    }
    await assertPublicHost(target.hostname, 'Jira URL');

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (target.origin === origin) {
      headers.Authorization = jiraAuthHeader(email, apiToken);
    }

    res = await fetch(url, { headers, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      url = new URL(location, url).toString();
      continue;
    }
    break;
  }

  if (!res) throw new Error('Jira API error: no response');
  if (res.status >= 300 && res.status < 400) {
    throw new Error('Jira API error: too many redirects');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ---- Public API ------------------------------------------------------------

export async function getJiraProjects(input: {
  jiraUrl: string;
  email: string;
  apiToken: string;
}): Promise<Array<{ id: string; key: string; name: string; type: string }>> {
  const projects = await jiraFetch<JiraProject[]>(
    input.jiraUrl,
    '/rest/api/3/project',
    input.email,
    input.apiToken,
  );
  return projects.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    type: p.projectTypeKey,
  }));
}

export async function startJiraImport(
  ctx: FullAuthContext,
  input: {
    jiraUrl: string;
    email: string;
    apiToken: string;
    jiraProjectKey: string;
    projectId: string;
  },
): Promise<ImportJobRow> {
  if (!canCreateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to import issues');
  }
  await requireFeature(ctx, 'csv_import');

  if (!input.jiraUrl || !input.email || !input.apiToken || !input.jiraProjectKey) {
    throw new ValidationError('jiraUrl, email, apiToken, and jiraProjectKey are required');
  }

  // Verify target project exists in this workspace
  const { rows: projects } = await tenantPoolQuery<ProjectRow>(
    ctx.workspace.id,
    `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
    [input.projectId],
  );
  if (!projects[0]) throw new NotFoundError('Project not found');

  const jobId = newId();
  const filename = `jira-${input.jiraProjectKey}`;

  const { rows: jobs } = await getPool().query<ImportJobRow>(
    `INSERT INTO import_jobs (id, workspace_id, project_id, filename, total_rows, field_mapping, created_by)
     VALUES ($1, $2, $3, $4, 0, $5, $6)
     RETURNING *`,
    [
      jobId,
      ctx.workspace.id,
      input.projectId,
      filename,
      JSON.stringify({ source: 'jira', jiraProjectKey: input.jiraProjectKey }),
      ctx.user.id,
    ],
  );

  // Fire-and-forget — progress tracked in import_jobs row
  processJiraImport(ctx, jobs[0]!.id, input).catch(() => {});

  return jobs[0]!;
}

// ---- Background processing -------------------------------------------------

async function processJiraImport(
  ctx: FullAuthContext,
  jobId: string,
  input: {
    jiraUrl: string;
    email: string;
    apiToken: string;
    jiraProjectKey: string;
    projectId: string;
  },
): Promise<void> {
  const pool = getPool();

  await pool.query(`UPDATE import_jobs SET status = 'processing' WHERE id = $1`, [jobId]);

  try {
    // Load workspace states
    const statesResult = await tenantPoolQuery<WorkflowStateRow>(
      ctx.workspace.id,
      `SELECT * FROM workflow_states WHERE {TENANT} ORDER BY position ASC`,
    );
    const stateByType = new Map<string, WorkflowStateRow>();
    for (const s of statesResult.rows) {
      if (!stateByType.has(s.type)) stateByType.set(s.type, s);
    }
    const defaultState =
      stateByType.get('unstarted') ??
      stateByType.get('backlog') ??
      statesResult.rows[0];

    // Load project
    const projectResult = await pool.query<ProjectRow>(
      `SELECT * FROM projects WHERE id = $1`,
      [input.projectId],
    );
    const project = projectResult.rows[0]!;

    // Load workspace users for assignee matching
    const usersResult = await tenantPoolQuery<UserRow>(
      ctx.workspace.id,
      `SELECT * FROM users WHERE {TENANT}`,
    );
    const userByEmail = new Map(usersResult.rows.map((u) => [u.email.toLowerCase(), u]));

    // Label cache: name → id
    const labelCache = new Map<string, string>();
    const existingLabels = await tenantPoolQuery<{ id: string; name: string }>(
      ctx.workspace.id,
      `SELECT id, name FROM labels WHERE {TENANT}`,
    );
    for (const l of existingLabels.rows) labelCache.set(l.name.toLowerCase(), l.id);

    // Fetch all issues from Jira using pagination
    const allIssues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const jql = encodeURIComponent(`project = ${input.jiraProjectKey} ORDER BY created ASC`);
      const fields = 'summary,description,status,priority,assignee,labels,created,updated,comment';
      const result = await jiraFetch<{
        total: number;
        startAt: number;
        maxResults: number;
        issues: JiraIssue[];
      }>(
        input.jiraUrl,
        `/rest/api/3/search?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}&expand=renderedFields`,
        input.email,
        input.apiToken,
      );

      allIssues.push(...result.issues);
      if (allIssues.length >= result.total || result.issues.length === 0) break;
      startAt += result.issues.length;
    }

    // Update total count
    await pool.query(`UPDATE import_jobs SET total_rows = $1 WHERE id = $2`, [
      allIssues.length,
      jobId,
    ]);

    let imported = 0;
    let failed = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < allIssues.length; i++) {
      const jiraIssue = allIssues[i]!;
      try {
        const title = jiraIssue.fields.summary?.trim();
        if (!title) {
          errors.push({ row: i + 1, message: `Issue ${jiraIssue.key}: empty summary` });
          failed++;
          continue;
        }

        const description = jiraIssue.fields.description
          ? adfToHtml(jiraIssue.fields.description)
          : null;

        const priority = mapJiraPriority(jiraIssue.fields.priority?.name);

        const statusCatKey = jiraIssue.fields.status?.statusCategory?.key ?? 'new';
        const xpntlStateType = mapJiraStatusCategory(statusCatKey);
        const state =
          stateByType.get(xpntlStateType) ??
          defaultState;
        const stateId = state?.id;

        // Match assignee by email
        let assigneeId: string | null = null;
        const jiraAssigneeEmail = jiraIssue.fields.assignee?.emailAddress?.toLowerCase();
        if (jiraAssigneeEmail) {
          assigneeId = userByEmail.get(jiraAssigneeEmail)?.id ?? null;
        }

        // Ensure labels exist and collect IDs
        const labelIds: string[] = [];
        for (const labelName of jiraIssue.fields.labels ?? []) {
          if (!labelName) continue;
          const key = labelName.toLowerCase();
          let labelId = labelCache.get(key);
          if (!labelId) {
            // Create label if it doesn't exist (uses pool directly — outside transaction)
            const color = '#6B7280'; // neutral gray for imported labels
            const newLabelId = newId();
            try {
              await pool.query(
                `INSERT INTO labels (id, workspace_id, name, color)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id`,
                [newLabelId, ctx.workspace.id, labelName, color],
              );
              // Re-fetch to get actual id in case of conflict
              const { rows: lrows } = await pool.query<{ id: string }>(
                `SELECT id FROM labels WHERE workspace_id = $1 AND lower(name) = lower($2)`,
                [ctx.workspace.id, labelName],
              );
              if (lrows[0]) {
                labelId = lrows[0].id;
                labelCache.set(key, labelId);
              }
            } catch {
              // If label creation fails, skip it
            }
          }
          if (labelId) labelIds.push(labelId);
        }

        const issueId = newId();
        const jiraCreated = new Date(jiraIssue.fields.created);
        const jiraUpdated = new Date(jiraIssue.fields.updated);

        await withTransaction(async (client) => {
          // Atomically increment and get project key counter
          const counterResult = await client.query<{ last_key: number }>(
            `INSERT INTO project_key_counters (project_id, last_key)
             VALUES ($1, 1)
             ON CONFLICT (project_id)
             DO UPDATE SET last_key = project_key_counters.last_key + 1
             RETURNING last_key`,
            [project.id],
          );
          const key = `${project.key}-${counterResult.rows[0]!.last_key}`;

          await client.query(
            `INSERT INTO issues
               (id, workspace_id, key, title, description, state_id, priority,
                assignee_id, creator_id, project_id, sort_order, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                     extract(epoch FROM now()), $11, $12)`,
            [
              issueId,
              ctx.workspace.id,
              key,
              title,
              description,
              stateId,
              priority,
              assigneeId,
              ctx.user.id,
              project.id,
              jiraCreated,
              jiraUpdated,
            ],
          );

          // Attach labels
          for (const labelId of labelIds) {
            await client.query(
              `INSERT INTO issue_labels (workspace_id, issue_id, label_id, attached_by)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [ctx.workspace.id, issueId, labelId, ctx.user.id],
            );
          }

          // Assign assignee in issue_assignees if matched
          if (assigneeId) {
            await client.query(
              `INSERT INTO issue_assignees (issue_id, user_id, position, assigned_by)
               VALUES ($1, $2, 0, $3)
               ON CONFLICT DO NOTHING`,
              [issueId, assigneeId, ctx.user.id],
            );
          }
        });

        // Import comments (outside transaction for simplicity)
        const comments = jiraIssue.fields.comment?.comments ?? [];
        for (const jiraComment of comments) {
          const body =
            typeof jiraComment.body === 'string'
              ? jiraComment.body
              : adfToHtml(jiraComment.body as AdfDoc);

          if (!body.trim()) continue;

          // Try to match comment author to a workspace user
          const commentAuthorEmail = jiraComment.author.emailAddress?.toLowerCase();
          const commentAuthorId =
            (commentAuthorEmail ? userByEmail.get(commentAuthorEmail)?.id : undefined) ??
            ctx.user.id;

          await pool.query(
            `INSERT INTO comments (id, workspace_id, issue_id, author_id, body, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              newId(),
              ctx.workspace.id,
              issueId,
              commentAuthorId,
              body,
              new Date(jiraComment.created),
            ],
          );
        }

        imported++;

        // Update progress every 10 issues
        if (imported % 10 === 0) {
          await pool.query(
            `UPDATE import_jobs SET imported_rows = $1 WHERE id = $2`,
            [imported, jobId],
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ row: i + 1, message: `Issue ${jiraIssue.key}: ${msg}` });
        failed++;
      }
    }

    await pool.query(
      `UPDATE import_jobs
          SET status = 'completed', imported_rows = $1, failed_rows = $2,
              errors = $3, completed_at = now()
        WHERE id = $4`,
      [imported, failed, JSON.stringify(errors), jobId],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `UPDATE import_jobs
          SET status = 'failed', errors = $1, completed_at = now()
        WHERE id = $2`,
      [JSON.stringify([{ row: 0, message: msg }]), jobId],
    );
  }
}
