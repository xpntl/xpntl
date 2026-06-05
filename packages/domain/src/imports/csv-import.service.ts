import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { requireFeature } from '../billing/gate.js';
import { canCreateIssue } from '../authz.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, IssueRow, ProjectRow, WorkflowStateRow } from '../types.js';

export type ImportJobRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  field_mapping: Record<string, string>;
  errors: Array<{ row: number; message: string }>;
  created_by: string | null;
  created_at: Date;
  completed_at: Date | null;
};

export type FieldMapping = {
  title: string;
  description?: string;
  priority?: string;
  state?: string;
  assignee?: string;
};

const REQUIRED_FIELDS = ['title'] as const;
const VALID_TARGET_FIELDS = ['title', 'description', 'priority', 'state', 'assignee'] as const;

export function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new ValidationError('CSV is empty');

  const headers = parseCsvLine(lines[0]!);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function validateMapping(
  headers: string[],
  mapping: Record<string, string>,
): void {
  for (const field of REQUIRED_FIELDS) {
    if (!mapping[field]) {
      throw new ValidationError(`Missing required field mapping: ${field}`);
    }
  }

  for (const [target, source] of Object.entries(mapping)) {
    if (!(VALID_TARGET_FIELDS as readonly string[]).includes(target)) {
      throw new ValidationError(`Invalid target field: ${target}`);
    }
    if (!headers.includes(source)) {
      throw new ValidationError(`Source column "${source}" not found in CSV headers`);
    }
  }
}

export async function createImportJob(
  ctx: FullAuthContext,
  input: { projectId: string; filename: string; csvContent: string; mapping: Record<string, string> },
): Promise<ImportJobRow> {
  if (!canCreateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to import issues');
  }
  await requireFeature(ctx, 'csv_import');

  const { headers, rows } = parseCsv(input.csvContent);
  validateMapping(headers, input.mapping);

  if (rows.length === 0) throw new ValidationError('CSV has no data rows');
  if (rows.length > 1000) throw new ValidationError('Maximum 1,000 rows per import');

  const { rows: projects } = await tenantPoolQuery<ProjectRow>(
    ctx.workspace.id,
    `SELECT id FROM projects WHERE {TENANT} AND id = $1`,
    [input.projectId],
  );
  if (!projects[0]) throw new NotFoundError('Project not found');

  const id = newId();
  const { rows: jobs } = await getPool().query<ImportJobRow>(
    `INSERT INTO import_jobs (id, workspace_id, project_id, filename, total_rows, field_mapping, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, ctx.workspace.id, input.projectId, input.filename, rows.length, JSON.stringify(input.mapping), ctx.user.id],
  );

  processImport(ctx, jobs[0]!.id, headers, rows, input.mapping).catch(() => {});

  return jobs[0]!;
}

export async function getImportJob(
  ctx: FullAuthContext,
  jobId: string,
): Promise<ImportJobRow> {
  const { rows } = await getPool().query<ImportJobRow>(
    `SELECT * FROM import_jobs WHERE id = $1 AND workspace_id = $2`,
    [jobId, ctx.workspace.id],
  );
  if (!rows[0]) throw new NotFoundError('Import job not found');
  return rows[0];
}

export async function listImportJobs(
  ctx: FullAuthContext,
): Promise<ImportJobRow[]> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can view import history');
  }
  const { rows } = await tenantPoolQuery<ImportJobRow>(
    ctx.workspace.id,
    `SELECT * FROM import_jobs WHERE {TENANT} ORDER BY created_at DESC LIMIT 50`,
  );
  return rows;
}

async function processImport(
  ctx: FullAuthContext,
  jobId: string,
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
): Promise<void> {
  const pool = getPool();

  await pool.query(
    `UPDATE import_jobs SET status = 'processing' WHERE id = $1`,
    [jobId],
  );

  const statesResult = await tenantPoolQuery<WorkflowStateRow>(
    ctx.workspace.id,
    `SELECT * FROM workflow_states WHERE {TENANT} ORDER BY position ASC`,
  );
  const stateByName = new Map(statesResult.rows.map((s) => [s.name.toLowerCase(), s]));
  const defaultState = statesResult.rows.find((s) => s.type === 'unstarted') ?? statesResult.rows[0];

  const projectResult = await pool.query<ProjectRow>(
    `SELECT * FROM projects WHERE id = (SELECT project_id FROM import_jobs WHERE id = $1)`,
    [jobId],
  );
  const project = projectResult.rows[0]!;

  let imported = 0;
  let failed = 0;
  const errors: Array<{ row: number; message: string }> = [];

  const titleIdx = headers.indexOf(mapping.title!);
  const descIdx = mapping.description ? headers.indexOf(mapping.description) : -1;
  const priorityIdx = mapping.priority ? headers.indexOf(mapping.priority) : -1;
  const stateIdx = mapping.state ? headers.indexOf(mapping.state) : -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const title = row[titleIdx]?.trim();
      if (!title) {
        errors.push({ row: i + 2, message: 'Empty title' });
        failed++;
        continue;
      }

      const description = descIdx >= 0 ? row[descIdx]?.trim() || null : null;
      let priority = 0;
      if (priorityIdx >= 0 && row[priorityIdx]) {
        const p = parseInt(row[priorityIdx]!, 10);
        if (!isNaN(p) && p >= 0 && p <= 4) priority = p;
      }

      let stateId = defaultState?.id;
      if (stateIdx >= 0 && row[stateIdx]) {
        const match = stateByName.get(row[stateIdx]!.toLowerCase());
        if (match) stateId = match.id;
      }

      await withTransaction(async (client) => {
        const counterResult = await client.query<{ last_key: number }>(
          `INSERT INTO project_key_counters (project_id, last_key)
           VALUES ($1, 1)
           ON CONFLICT (project_id)
           DO UPDATE SET last_key = project_key_counters.last_key + 1
           RETURNING last_key`,
          [project.id],
        );
        const key = `${project.key}-${counterResult.rows[0]!.last_key}`;

        await client.query<IssueRow>(
          `INSERT INTO issues (id, workspace_id, key, title, description, state_id, priority, creator_id, project_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, extract(epoch FROM now()))`,
          [newId(), ctx.workspace.id, key, title, description, stateId, priority, ctx.user.id, project.id],
        );
      });

      imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: i + 2, message: msg });
      failed++;
    }
  }

  await pool.query(
    `UPDATE import_jobs SET status = 'completed', imported_rows = $1, failed_rows = $2, errors = $3, completed_at = now() WHERE id = $4`,
    [imported, failed, JSON.stringify(errors), jobId],
  );
}
