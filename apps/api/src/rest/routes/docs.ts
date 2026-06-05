import { docs } from '@xpntl/domain';

type DocRow = Awaited<ReturnType<typeof docs.getDoc>>;
type DocRevisionRow = Awaited<ReturnType<typeof docs.listRevisions>>[number];
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const docsRouter: Router = Router();

docsRouter.use(requireFullAuth);

const createSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional(),
  projectId: z.string().optional(),
  parentId: z.string().min(1).nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  parentId: z.string().min(1).nullable().optional(),
});

// List docs (optionally filtered by projectId query param)
docsRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const result = await docs.listDocs(getAuth(req), { projectId });
  res.json({ docs: result.map(toDocJson) });
});

// Get single doc
docsRouter.get('/:id', async (req, res) => {
  const doc = await docs.getDoc(getAuth(req), req.params.id!);
  res.json({ doc: toDocJson(doc) });
});

// Create doc
docsRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const doc = await docs.createDoc(getAuth(req), input);
  res.status(201).json({ doc: toDocJson(doc) });
});

// Update doc
docsRouter.patch('/:id', async (req, res) => {
  const input = updateSchema.parse(req.body);
  const doc = await docs.updateDoc(getAuth(req), req.params.id!, input);
  res.json({ doc: toDocJson(doc) });
});

// Delete doc (admin only)
docsRouter.delete('/:id', async (req, res) => {
  await docs.deleteDoc(getAuth(req), req.params.id!);
  res.status(204).end();
});

// List revisions for a doc
docsRouter.get('/:id/revisions', async (req, res) => {
  const revisions = await docs.listRevisions(getAuth(req), req.params.id!);
  res.json({ revisions: revisions.map(toRevisionJson) });
});

function toDocJson(d: DocRow) {
  return {
    id: d.id,
    workspaceId: d.workspace_id,
    projectId: d.project_id,
    parentId: d.parent_id,
    position: d.position,
    title: d.title,
    content: d.content,
    createdBy: d.created_by,
    updatedBy: d.updated_by,
    createdAt: d.created_at.toISOString(),
    updatedAt: d.updated_at.toISOString(),
  };
}

function toRevisionJson(r: DocRevisionRow) {
  return {
    id: r.id,
    docId: r.doc_id,
    content: r.content,
    editedBy: r.edited_by,
    createdAt: r.created_at.toISOString(),
  };
}
