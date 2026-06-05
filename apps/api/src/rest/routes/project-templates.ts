import {
  type ProjectTemplateRow,
  createProjectTemplate,
  deleteProjectTemplate,
  getProjectTemplateById,
  listProjectTemplates,
  updateProjectTemplate,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const projectTemplatesRouter: Router = Router();

projectTemplatesRouter.use(requireFullAuth);

const variableSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  defaultValue: z.string().max(500).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  icon: z.string().max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  variables: z.array(variableSchema).max(20).optional(),
  blueprint: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  variables: z.array(variableSchema).max(20).optional(),
  blueprint: z.record(z.unknown()).optional(),
});

projectTemplatesRouter.get('/', async (req, res) => {
  const templates = await listProjectTemplates(getAuth(req));
  res.json({ templates: templates.map(toJson) });
});

projectTemplatesRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const template = await createProjectTemplate({
    ctx: getAuth(req),
    ...input,
    blueprint: input.blueprint as ProjectTemplateRow['blueprint'],
    variables: input.variables as ProjectTemplateRow['variables'],
  });
  res.status(201).json({ template: toJson(template) });
});

projectTemplatesRouter.get('/:id', async (req, res) => {
  const template = await getProjectTemplateById(getAuth(req), req.params.id!);
  res.json({ template: toJson(template) });
});

projectTemplatesRouter.patch('/:id', async (req, res) => {
  const patch = updateSchema.parse(req.body);
  const template = await updateProjectTemplate({
    ctx: getAuth(req),
    id: req.params.id!,
    ...patch,
    blueprint: patch.blueprint as ProjectTemplateRow['blueprint'],
    variables: patch.variables as ProjectTemplateRow['variables'],
  });
  res.json({ template: toJson(template) });
});

projectTemplatesRouter.delete('/:id', async (req, res) => {
  await deleteProjectTemplate(getAuth(req), req.params.id!);
  res.status(204).end();
});

function toJson(t: ProjectTemplateRow) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    color: t.color,
    variables: t.variables,
    blueprint: t.blueprint,
    createdBy: t.created_by,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}
