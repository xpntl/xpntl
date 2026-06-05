import { listWorkflowStates } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const workflowStatesRouter: Router = Router();

workflowStatesRouter.use(requireFullAuth);

workflowStatesRouter.get('/', async (req, res) => {
  const states = await listWorkflowStates(getAuth(req));
  res.json({
    states: states.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      position: s.position,
    })),
  });
});
