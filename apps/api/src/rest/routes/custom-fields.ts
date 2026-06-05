import {
  type CustomFieldRow,
  createCustomField,
  deleteCustomField,
  getCustomFieldById,
  listCustomFields,
  updateCustomField,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const customFieldsRouter: Router = Router();

customFieldsRouter.use(requireFullAuth);

const createSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  type: z.enum(['dropdown', 'number', 'url', 'date']),
  config: z.record(z.unknown()).optional(),
  required: z.boolean().optional(),
});

const updateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  required: z.boolean().optional(),
});

customFieldsRouter.get('/', async (req, res) => {
  const fields = await listCustomFields(getAuth(req));
  res.json({ fields: fields.map(toJson) });
});

customFieldsRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const field = await createCustomField({ ctx: getAuth(req), ...input });
  res.status(201).json({ field: toJson(field) });
});

customFieldsRouter.get('/:id', async (req, res) => {
  const field = await getCustomFieldById(getAuth(req), req.params.id!);
  res.json({ field: toJson(field) });
});

customFieldsRouter.patch('/:id', async (req, res) => {
  const patch = updateSchema.parse(req.body);
  const field = await updateCustomField({ ctx: getAuth(req), id: req.params.id!, ...patch });
  res.json({ field: toJson(field) });
});

customFieldsRouter.delete('/:id', async (req, res) => {
  await deleteCustomField(getAuth(req), req.params.id!);
  res.status(204).end();
});

function toJson(f: CustomFieldRow) {
  return {
    id: f.id,
    slug: f.slug,
    label: f.label,
    type: f.type,
    config: f.config,
    position: f.position,
    required: f.required,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  };
}
