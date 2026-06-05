import {
  type IssueTemplateRow,
  createIssueTemplate,
  deleteIssueTemplate,
  getIssueTemplateById,
  listIssueTemplates,
  updateIssueTemplate,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const issueTemplatesRouter: Router = Router();

issueTemplatesRouter.use(requireFullAuth);

const createSchema = z.object({
  teamId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  templateTitle: z.string().max(500).optional(),
  templateBody: z.string().max(50000).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  stateId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  labelIds: z.array(z.string().min(1)).max(20).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  templateTitle: z.string().max(500).nullable().optional(),
  templateBody: z.string().max(50000).nullable().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  stateId: z.string().min(1).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  labelIds: z.array(z.string().min(1)).max(20).optional(),
});

issueTemplatesRouter.get('/', async (req, res) => {
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
  const templates = await listIssueTemplates(getAuth(req), teamId);
  res.json({ templates: templates.map(toJson) });
});

issueTemplatesRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const template = await createIssueTemplate({ ctx: getAuth(req), ...input });
  res.status(201).json({ template: toJson(template) });
});

issueTemplatesRouter.get('/:id', async (req, res) => {
  const template = await getIssueTemplateById(getAuth(req), req.params.id!);
  res.json({ template: toJson(template) });
});

issueTemplatesRouter.patch('/:id', async (req, res) => {
  const patch = updateSchema.parse(req.body);
  const template = await updateIssueTemplate({ ctx: getAuth(req), id: req.params.id!, ...patch });
  res.json({ template: toJson(template) });
});

issueTemplatesRouter.delete('/:id', async (req, res) => {
  await deleteIssueTemplate(getAuth(req), req.params.id!);
  res.status(204).end();
});

function toJson(t: IssueTemplateRow) {
  return {
    id: t.id,
    teamId: t.team_id,
    name: t.name,
    description: t.description,
    templateTitle: t.template_title,
    templateBody: t.template_body,
    priority: t.priority,
    stateId: t.state_id,
    assigneeId: t.assignee_id,
    labelIds: t.label_ids,
    position: t.position,
    createdBy: t.created_by,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}
