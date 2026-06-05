import {
  type InitiativeRow,
  createInitiative,
  getInitiativeById,
  listInitiatives,
  updateInitiative,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const initiativesRouter: Router = Router();

initiativesRouter.use(requireFullAuth);

const createInitiativeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const updateInitiativeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['planned', 'active', 'completed', 'canceled']).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

initiativesRouter.get('/', async (req, res) => {
  const initiatives = await listInitiatives(getAuth(req));
  res.json({ initiatives: initiatives.map(toInitiativeJson) });
});

initiativesRouter.post('/', async (req, res) => {
  const input = createInitiativeSchema.parse(req.body);
  const initiative = await createInitiative({ ctx: getAuth(req), ...input });
  res.status(201).json({ initiative: toInitiativeJson(initiative) });
});

initiativesRouter.get('/:id', async (req, res) => {
  const initiative = await getInitiativeById(getAuth(req), req.params.id!);
  res.json({ initiative: toInitiativeJson(initiative) });
});

initiativesRouter.patch('/:id', async (req, res) => {
  const patch = updateInitiativeSchema.parse(req.body);
  const initiative = await updateInitiative({ ctx: getAuth(req), id: req.params.id!, ...patch });
  res.json({ initiative: toInitiativeJson(initiative) });
});

function toInitiativeJson(i: InitiativeRow) {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    status: i.status,
    color: i.color,
    sortOrder: i.sort_order,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}
