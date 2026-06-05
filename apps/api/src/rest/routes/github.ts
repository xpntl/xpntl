import { github } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const githubRouter: Router = Router();

const createSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  installationId: z.number().optional(),
});

githubRouter.get('/integrations', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const rows = await github.listIntegrations(ctx);
  res.json({
    // webhook_secret is intentionally omitted — it's a signing secret and is
    // only returned once at creation time (see POST /integrations).
    integrations: rows.map((r) => ({
      id: r.id,
      owner: r.owner,
      repo: r.repo,
      active: r.active,
      createdAt: r.created_at,
    })),
  });
});

githubRouter.post('/integrations', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const input = createSchema.parse(req.body);
  const row = await github.createIntegration(ctx, input);
  res.status(201).json({
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    webhookSecret: row.webhook_secret,
    active: row.active,
    createdAt: row.created_at,
  });
});

githubRouter.delete('/integrations/:id', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  await github.deleteIntegration(ctx, String(req.params.id));
  res.json({ ok: true });
});

githubRouter.get('/issues/:key/pr-links', requireFullAuth, async (req, res) => {
  const ctx = getAuth(req);
  const links = await github.listPrLinks(ctx, String(req.params.key));
  res.json({
    prLinks: links.map((l) => ({
      id: l.id,
      prNumber: l.pr_number,
      prUrl: l.pr_url,
      prTitle: l.pr_title,
      repoOwner: l.repo_owner,
      repoName: l.repo_name,
      status: l.status,
      autoClose: l.auto_close,
      createdAt: l.created_at,
    })),
  });
});

githubRouter.post('/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];

  if (typeof signature !== 'string' || !event) {
    res.status(400).json({ error: 'Missing signature or event header' });
    return;
  }

  if (event === 'ping') {
    res.json({ ok: true });
    return;
  }

  if (event !== 'pull_request') {
    res.status(200).json({ ignored: true });
    return;
  }

  // The raw request bytes (express.raw is mounted on this path) — HMAC must be
  // verified over exactly what GitHub sent, not a re-serialized JSON object.
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  let body: { repository?: { owner?: { login?: string }; name?: string } };
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }
  const repo = body?.repository;
  if (!repo?.owner?.login || !repo?.name) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  // A repo can have integrations in multiple workspaces. Verify the signature
  // against EACH integration's own secret and process only the ones that match,
  // so a webhook signed for workspace A can never mutate workspace B (XP-108 #2).
  const integrations = await github.listActiveIntegrationsByRepo(repo.owner.login, repo.name);
  if (integrations.length === 0) {
    res.status(200).json({ ignored: true, reason: 'no matching integration' });
    return;
  }

  const verified = integrations.filter((i) =>
    github.verifyGitHubSignature(rawBody, signature, i.webhook_secret),
  );
  if (verified.length === 0) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const payload = body as Parameters<typeof github.handlePullRequestEventForIntegration>[1];
  for (const integration of verified) {
    await github.handlePullRequestEventForIntegration(integration, payload);
  }
  res.json({ ok: true });
});
