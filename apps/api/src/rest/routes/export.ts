import { dataExport } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const exportRouter: Router = Router();

exportRouter.use(requireFullAuth);

/** GET /v1/export — download full workspace data as JSON */
exportRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const slug = ctx.workspace.slug;
  const date = new Date().toISOString().slice(0, 10);

  const data = await dataExport.exportWorkspaceData(ctx, ctx.workspace.id);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="xpntl-export-${slug}-${date}.json"`);
  res.json(data);
});
