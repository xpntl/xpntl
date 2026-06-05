import { type LabelRow, createLabel, deleteLabel, listLabels, updateLabel } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const labelsRouter: Router = Router();

labelsRouter.use(requireFullAuth);

const createLabelSchema = z.object({
  name: z
    .string()
    .min(1, 'Label name is required')
    .max(60, 'Label name must be 60 characters or fewer'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Label color must be a 6-digit hex string like #4EA7FC')
    .optional(),
  description: z.string().max(500).nullable().optional(),
});

labelsRouter.get('/', async (req, res) => {
  const labels = await listLabels(getAuth(req));
  res.json({ labels: labels.map(toLabelJson) });
});

labelsRouter.post('/', async (req, res) => {
  const input = createLabelSchema.parse(req.body);
  const label = await createLabel({
    ctx: getAuth(req),
    name: input.name,
    color: input.color,
    description: input.description,
  });
  res.status(201).json({ label: toLabelJson(label) });
});

const updateLabelSchema = z.object({
  name: z
    .string()
    .min(1, 'Label name is required')
    .max(60, 'Label name must be 60 characters or fewer')
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Label color must be a 6-digit hex string like #4EA7FC')
    .optional(),
  description: z.string().max(500).nullable().optional(),
});

labelsRouter.put('/:id', async (req, res) => {
  const input = updateLabelSchema.parse(req.body);
  const label = await updateLabel({
    ctx: getAuth(req),
    labelId: req.params.id!,
    name: input.name,
    color: input.color,
    description: input.description,
  });
  res.json({ label: toLabelJson(label) });
});

labelsRouter.delete('/:id', async (req, res) => {
  await deleteLabel({
    ctx: getAuth(req),
    labelId: req.params.id!,
  });
  res.json({ ok: true });
});

export function toLabelJson(l: LabelRow): {
  id: string;
  name: string;
  color: string;
  description: string | null;
} {
  return {
    id: l.id,
    name: l.name,
    color: l.color,
    description: l.description,
  };
}
