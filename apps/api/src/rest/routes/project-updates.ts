import { projectUpdates } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

type ProjectUpdateRow = Awaited<ReturnType<typeof projectUpdates.createProjectUpdate>>;

export const projectUpdatesRouter: Router = Router();

projectUpdatesRouter.use(requireFullAuth);

const createSchema = z.object({
  projectId: z.string().min(1),
  body: z.string().min(1).max(10_000),
  health: z.enum(['on_track', 'at_risk', 'off_track']).optional(),
});

// List updates for a project (?projectId=)
projectUpdatesRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query param is required' });
    return;
  }
  const result = await projectUpdates.listProjectUpdates(getAuth(req), projectId);
  res.json({ updates: result.map(toJson) });
});

projectUpdatesRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const update = await projectUpdates.createProjectUpdate(getAuth(req), input);
  res.status(201).json({ update: toJson(update) });
});

projectUpdatesRouter.delete('/:id', async (req, res) => {
  await projectUpdates.deleteProjectUpdate(getAuth(req), req.params.id!);
  res.status(204).end();
});

function toJson(u: ProjectUpdateRow) {
  return {
    id: u.id,
    projectId: u.project_id,
    body: u.body,
    health: u.health,
    createdBy: u.created_by,
    createdAt: u.created_at.toISOString(),
    updatedAt: u.updated_at.toISOString(),
  };
}
