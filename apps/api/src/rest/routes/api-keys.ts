import { apiKeys } from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const apiKeysRouter: Router = Router();

const VALID_SCOPES = [
  'issues:read',
  'issues:write',
  'comments:read',
  'comments:write',
  'projects:read',
  'projects:write',
  'labels:read',
  'labels:write',
  'teams:read',
  'users:read',
];

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  scopes: z.array(z.string().refine((s) => VALID_SCOPES.includes(s), { message: 'Invalid scope' }))
    .min(1, 'At least one scope is required'),
});

apiKeysRouter.post('/', requireFullAuth, async (req, res) => {
  const { name, scopes } = createSchema.parse(req.body);
  const auth = getAuth(req);
  const { key, record } = await apiKeys.createApiKey(auth, auth.user.id, name, scopes);

  res.status(201).json({
    key,
    record: toApiKeyJson(record),
  });
});

apiKeysRouter.get('/', requireFullAuth, async (req, res) => {
  const auth = getAuth(req);
  const keys = await apiKeys.listApiKeys(auth);

  res.json({
    keys: keys.map(toApiKeyJson),
  });
});

apiKeysRouter.delete('/:id', requireFullAuth, async (req, res) => {
  const auth = getAuth(req);
  await apiKeys.revokeApiKey(auth, String(req.params.id));
  res.status(204).end();
});

function toApiKeyJson(row: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
