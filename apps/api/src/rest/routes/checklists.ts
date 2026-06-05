import {
  type ChecklistItemRow,
  type ChecklistRow,
  type ChecklistWithItems,
  addChecklistItem,
  createChecklist,
  deleteChecklist,
  deleteChecklistItem,
  getIssueByKey,
  listChecklistsForIssue,
  updateChecklist,
  updateChecklistItem,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const checklistsRouter: Router = Router();

checklistsRouter.use(requireFullAuth);

const createChecklistSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

const updateChecklistSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  position: z.number().int().min(0).optional(),
});

const addItemSchema = z.object({
  content: z.string().min(1).max(2000),
  assigneeId: z.string().min(1).optional(),
  dueDate: z.string().datetime().optional(),
});

const updateItemSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  checked: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

checklistsRouter.get('/:key/checklists', async (req, res) => {
  const key = String(req.params.key);
  const issue = await getIssueByKey(getAuth(req), key);
  const checklists = await listChecklistsForIssue(getAuth(req), issue.id);
  res.json({ checklists: checklists.map(toChecklistJson) });
});

checklistsRouter.post('/:key/checklists', async (req, res) => {
  const key = String(req.params.key);
  const input = createChecklistSchema.parse(req.body);
  const issue = await getIssueByKey(getAuth(req), key);
  const checklist = await createChecklist({
    ctx: getAuth(req),
    issueId: issue.id,
    title: input.title,
  });
  res.status(201).json({ checklist: { ...toChecklistRowJson(checklist), items: [] } });
});

checklistsRouter.patch('/checklists/:id', async (req, res) => {
  const id = String(req.params.id);
  const input = updateChecklistSchema.parse(req.body);
  const checklist = await updateChecklist({
    ctx: getAuth(req),
    checklistId: id,
    title: input.title,
    position: input.position,
  });
  res.json({ checklist: toChecklistRowJson(checklist) });
});

checklistsRouter.delete('/checklists/:id', async (req, res) => {
  const id = String(req.params.id);
  await deleteChecklist({ ctx: getAuth(req), checklistId: id });
  res.status(204).end();
});

checklistsRouter.post('/checklists/:id/items', async (req, res) => {
  const checklistId = String(req.params.id);
  const input = addItemSchema.parse(req.body);
  const item = await addChecklistItem({
    ctx: getAuth(req),
    checklistId,
    content: input.content,
    assigneeId: input.assigneeId,
    dueDate: input.dueDate,
  });
  res.status(201).json({ item: toItemJson(item) });
});

checklistsRouter.patch('/checklist-items/:id', async (req, res) => {
  const id = String(req.params.id);
  const input = updateItemSchema.parse(req.body);
  const item = await updateChecklistItem({
    ctx: getAuth(req),
    itemId: id,
    ...input,
  });
  res.json({ item: toItemJson(item) });
});

checklistsRouter.delete('/checklist-items/:id', async (req, res) => {
  const id = String(req.params.id);
  await deleteChecklistItem({ ctx: getAuth(req), itemId: id });
  res.status(204).end();
});

function toChecklistRowJson(c: ChecklistRow) {
  return {
    id: c.id,
    issueId: c.issue_id,
    title: c.title,
    position: c.position,
    createdBy: c.created_by,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

function toItemJson(i: ChecklistItemRow) {
  return {
    id: i.id,
    checklistId: i.checklist_id,
    content: i.content,
    checked: i.checked,
    position: i.position,
    assigneeId: i.assignee_id,
    dueDate: i.due_date,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

function toChecklistJson(c: ChecklistWithItems) {
  return {
    ...toChecklistRowJson(c),
    items: c.items.map(toItemJson),
  };
}
