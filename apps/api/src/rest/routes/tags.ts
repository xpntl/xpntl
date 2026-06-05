import {
  type TagRow,
  createTag,
  deleteTag,
  getIssueByKey,
  listTags,
  mergeTags,
  tagIssue,
  untagIssue,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const tagsRouter: Router = Router();

tagsRouter.use(requireFullAuth);

const createTagSchema = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

tagsRouter.get('/', async (req, res) => {
  const tags = await listTags(getAuth(req));
  res.json({ tags: tags.map(toTagJson) });
});

tagsRouter.post('/', async (req, res) => {
  const input = createTagSchema.parse(req.body);
  const tag = await createTag({ ctx: getAuth(req), ...input });
  res.status(201).json({ tag: toTagJson(tag) });
});

tagsRouter.delete('/:id', async (req, res) => {
  await deleteTag(getAuth(req), req.params.id!);
  res.status(204).end();
});

tagsRouter.post('/:id/merge', async (req, res) => {
  const { targetId } = z.object({ targetId: z.string().min(1) }).parse(req.body);
  await mergeTags({ ctx: getAuth(req), sourceId: req.params.id!, targetId });
  res.json({ ok: true });
});

function toTagJson(t: TagRow) {
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    createdAt: t.created_at,
  };
}
