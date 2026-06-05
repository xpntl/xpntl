import {
  type SavedViewRow,
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const viewsRouter: Router = Router();

viewsRouter.use(requireFullAuth);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  filters: z.record(z.unknown()),
  scope: z.enum(['personal', 'workspace']).optional(),
  icon: z.string().max(10).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  filters: z.record(z.unknown()).optional(),
  scope: z.enum(['personal', 'workspace']).optional(),
  icon: z.string().max(10).nullable().optional(),
});

viewsRouter.get('/', async (req, res) => {
  const views = await listSavedViews(getAuth(req));
  res.json({ views: views.map(toViewJson) });
});

viewsRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const view = await createSavedView(getAuth(req), input);
  res.status(201).json({ view: toViewJson(view) });
});

viewsRouter.patch('/:id', async (req, res) => {
  const patch = updateSchema.parse(req.body);
  const view = await updateSavedView(getAuth(req), req.params.id!, patch);
  res.json({ view: toViewJson(view) });
});

viewsRouter.delete('/:id', async (req, res) => {
  await deleteSavedView(getAuth(req), req.params.id!);
  res.json({ ok: true });
});

function toViewJson(v: SavedViewRow) {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    filters: v.filters,
    scope: v.scope,
    icon: v.icon,
    creatorId: v.creator_id,
    position: v.position,
    createdAt: v.created_at.toISOString(),
    updatedAt: v.updated_at.toISOString(),
  };
}
