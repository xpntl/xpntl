import {
  type MilestoneRow,
  createMilestone,
  deleteMilestone,
  getMilestoneById,
  listMilestones,
  updateMilestone,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const milestonesRouter: Router = Router();

milestonesRouter.use(requireFullAuth);

const createMilestoneSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  targetDate: z.string().optional(),
});

const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  targetDate: z.string().nullable().optional(),
});

milestonesRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId;
  if (!projectId || typeof projectId !== 'string') {
    res
      .status(400)
      .json({ error: { code: 'validation_error', message: 'projectId query param required' } });
    return;
  }
  const milestones = await listMilestones(getAuth(req), projectId);
  res.json({ milestones: milestones.map(toMilestoneJson) });
});

milestonesRouter.post('/', async (req, res) => {
  const input = createMilestoneSchema.parse(req.body);
  const milestone = await createMilestone({ ctx: getAuth(req), ...input });
  res.status(201).json({ milestone: toMilestoneJson(milestone) });
});

milestonesRouter.get('/:id', async (req, res) => {
  const milestone = await getMilestoneById(getAuth(req), req.params.id!);
  res.json({ milestone: toMilestoneJson(milestone) });
});

milestonesRouter.patch('/:id', async (req, res) => {
  const patch = updateMilestoneSchema.parse(req.body);
  const milestone = await updateMilestone({ ctx: getAuth(req), id: req.params.id!, ...patch });
  res.json({ milestone: toMilestoneJson(milestone) });
});

milestonesRouter.delete('/:id', async (req, res) => {
  await deleteMilestone(getAuth(req), req.params.id!);
  res.status(204).end();
});

function toMilestoneJson(m: MilestoneRow) {
  return {
    id: m.id,
    projectId: m.project_id,
    name: m.name,
    description: m.description,
    targetDate: m.target_date,
    sortOrder: m.sort_order,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}
