import { listRecentIssues, pushRecentIssue } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const recentIssuesRouter: Router = Router();

recentIssuesRouter.use(requireFullAuth);

const pushSchema = z.object({
  issueKey: z.string().min(1),
  issueTitle: z.string().min(1),
});

recentIssuesRouter.get('/', async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const issues = await listRecentIssues(getAuth(req), limit);
  res.json({
    recentIssues: issues.map((r) => ({
      id: r.id,
      issueKey: r.issue_key,
      issueTitle: r.issue_title,
      viewedAt: r.viewed_at.toISOString(),
    })),
  });
});

recentIssuesRouter.post('/', async (req, res) => {
  const { issueKey, issueTitle } = pushSchema.parse(req.body);
  const row = await pushRecentIssue(getAuth(req), issueKey, issueTitle);
  res.status(201).json({
    recentIssue: {
      id: row.id,
      issueKey: row.issue_key,
      issueTitle: row.issue_title,
      viewedAt: row.viewed_at.toISOString(),
    },
  });
});
