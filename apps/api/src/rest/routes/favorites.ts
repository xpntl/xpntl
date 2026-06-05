import { type FavoriteRow, listFavorites, toggleFavorite } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const favoritesRouter: Router = Router();

favoritesRouter.use(requireFullAuth);

const ENTITY_TYPES = ['issue', 'project', 'view'] as const;

const toggleSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1),
});

favoritesRouter.get('/', async (req, res) => {
  const entityType = req.query.entityType as string | undefined;
  const validType = ENTITY_TYPES.find((t) => t === entityType);
  const favorites = await listFavorites(getAuth(req), validType);
  res.json({ favorites: favorites.map(toFavoriteJson) });
});

favoritesRouter.post('/toggle', async (req, res) => {
  const input = toggleSchema.parse(req.body);
  const result = await toggleFavorite(getAuth(req), input.entityType, input.entityId);
  res.json(result);
});

function toFavoriteJson(f: FavoriteRow) {
  return {
    id: f.id,
    entityType: f.entity_type,
    entityId: f.entity_id,
    position: f.position,
    createdAt: f.created_at.toISOString(),
  };
}
