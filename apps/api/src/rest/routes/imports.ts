import { billing, csvImport, githubImport, jiraImport } from '@xpntl/domain';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const importsRouter: Router = Router();

importsRouter.use(requireFullAuth);

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

const mappingSchema = z.object({
  projectId: z.string().min(1),
  mapping: z.record(z.string()),
});

importsRouter.post('/csv/preview', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: { code: 'validation_error', message: 'No file uploaded' } });
    return;
  }
  const content = req.file.buffer.toString('utf-8');
  const { headers, rows } = csvImport.parseCsv(content);
  res.json({
    headers,
    sampleRows: rows.slice(0, 5),
    totalRows: rows.length,
  });
});

importsRouter.post('/csv', upload.single('file'), async (req, res) => {
  const ctx = getAuth(req);
  if (!req.file) {
    res.status(400).json({ error: { code: 'validation_error', message: 'No file uploaded' } });
    return;
  }

  const meta = mappingSchema.parse(JSON.parse(req.body.metadata ?? '{}'));
  const content = req.file.buffer.toString('utf-8');

  const job = await csvImport.createImportJob(ctx, {
    projectId: meta.projectId,
    filename: req.file.originalname ?? 'import.csv',
    csvContent: content,
    mapping: meta.mapping,
  });

  res.status(201).json(toJobJson(job));
});

importsRouter.get('/jobs', async (req, res) => {
  const ctx = getAuth(req);
  const jobs = await csvImport.listImportJobs(ctx);
  res.json({ jobs: jobs.map(toJobJson) });
});

importsRouter.get('/jobs/:id', async (req, res) => {
  const ctx = getAuth(req);
  const job = await csvImport.getImportJob(ctx, req.params.id!);
  res.json(toJobJson(job));
});

// ---- Jira routes -----------------------------------------------------------

const jiraProjectsSchema = z.object({
  jiraUrl: z.string().min(1),
  email: z.string().email(),
  apiToken: z.string().min(1),
});

const jiraImportSchema = z.object({
  jiraUrl: z.string().min(1),
  email: z.string().email(),
  apiToken: z.string().min(1),
  jiraProjectKey: z.string().min(1),
  projectId: z.string().min(1),
});

importsRouter.post('/jira/projects', async (req, res) => {
  const input = jiraProjectsSchema.parse(req.body);
  const projects = await jiraImport.getJiraProjects(input);
  res.json({ projects });
});

importsRouter.post('/jira', async (req, res) => {
  const ctx = getAuth(req);
  const input = jiraImportSchema.parse(req.body);
  const job = await jiraImport.startJiraImport(ctx, input);
  res.status(201).json(toJobJson(job));
});

const githubRepoSchema = z.object({
  repo: z.string().min(1),
  token: z.string().min(1),
});

const githubImportSchema = z.object({
  repo: z.string().min(1),
  token: z.string().min(1),
  projectId: z.string().min(1),
});

importsRouter.post('/github/repo', async (req, res) => {
  // Router already enforces requireAuth; also gate token-probing behind the
  // import feature so only members with import access can validate repos/tokens.
  await billing.requireFeature(getAuth(req), 'csv_import');
  const input = githubRepoSchema.parse(req.body);
  const repo = await githubImport.getGithubRepo(input);
  res.json({ repo });
});

importsRouter.post('/github', async (req, res) => {
  const ctx = getAuth(req);
  const input = githubImportSchema.parse(req.body);
  const job = await githubImport.startGithubImport(ctx, input);
  res.status(201).json(toJobJson(job));
});

function toJobJson(j: csvImport.ImportJobRow) {
  return {
    id: j.id,
    projectId: j.project_id,
    status: j.status,
    filename: j.filename,
    totalRows: j.total_rows,
    importedRows: j.imported_rows,
    failedRows: j.failed_rows,
    fieldMapping: j.field_mapping,
    errors: j.errors,
    createdAt: j.created_at,
    completedAt: j.completed_at,
  };
}
