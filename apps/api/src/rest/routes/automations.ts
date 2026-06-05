import {
  type AutomationRow,
  createAutomation,
  deleteAutomation,
  listAutomations,
  updateAutomation,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const automationsRouter: Router = Router();

automationsRouter.use(requireFullAuth);

const triggerTypes = z.enum(['state_change', 'issue_created', 'label_added', 'due_date_passed']);

const actionTypes = z.enum([
  'set_label',
  'set_assignee',
  'set_priority',
  'add_comment',
  'move_state',
]);

const createAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  triggerType: triggerTypes,
  triggerConfig: z.record(z.unknown()).optional(),
  actionType: actionTypes,
  actionConfig: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const updateAutomationSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    triggerType: triggerTypes.optional(),
    triggerConfig: z.record(z.unknown()).optional(),
    actionType: actionTypes.optional(),
    actionConfig: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.triggerType !== undefined ||
      v.triggerConfig !== undefined ||
      v.actionType !== undefined ||
      v.actionConfig !== undefined ||
      v.enabled !== undefined,
    { message: 'patch must include at least one field' },
  );

automationsRouter.get('/', async (req, res) => {
  const automations = await listAutomations(getAuth(req));
  res.json({ automations: automations.map(toAutomationJson) });
});

automationsRouter.post('/', async (req, res) => {
  const input = createAutomationSchema.parse(req.body);
  const automation = await createAutomation(getAuth(req), input);
  res.status(201).json({ automation: toAutomationJson(automation) });
});

automationsRouter.patch('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  const input = updateAutomationSchema.parse(req.body);
  const automation = await updateAutomation(getAuth(req), id, input);
  res.json({ automation: toAutomationJson(automation) });
});

automationsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  await deleteAutomation(getAuth(req), id);
  res.status(204).end();
});

function toAutomationJson(a: AutomationRow) {
  return {
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    triggerType: a.trigger_type,
    triggerConfig: a.trigger_config,
    actionType: a.action_type,
    actionConfig: a.action_config,
    createdBy: a.created_by,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}
