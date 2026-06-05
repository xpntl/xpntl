import {
  assignComment,
  deleteComment,
  pinComment,
  resolveAssignedComment,
  toggleReaction,
  unassignComment,
  unpinComment,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const commentsRouter: Router = Router();

commentsRouter.use(requireFullAuth);

const toggleReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

const assignCommentSchema = z.object({
  assigneeId: z.string().min(1),
  dueAt: z.string().nullable().optional(),
});

commentsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  await deleteComment(getAuth(req), id);
  res.status(204).end();
});

commentsRouter.post('/:id/reactions/toggle', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  const input = toggleReactionSchema.parse(req.body);
  const result = await toggleReaction({
    ctx: getAuth(req),
    targetType: 'comment',
    targetId: id,
    emoji: input.emoji,
  });
  res.json(result);
});

commentsRouter.post('/:id/assign', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  const input = assignCommentSchema.parse(req.body);
  const comment = await assignComment(getAuth(req), id, input.assigneeId, input.dueAt ?? null);
  res.json({
    comment: {
      id: comment.id,
      assigneeId: comment.assignee_id,
      assignedDueAt: comment.assigned_due_at,
      assignedResolvedAt: comment.assigned_resolved_at,
      assignedResolvedBy: comment.assigned_resolved_by,
    },
  });
});

commentsRouter.post('/:id/resolve', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  const comment = await resolveAssignedComment(getAuth(req), id);
  res.json({
    comment: {
      id: comment.id,
      assigneeId: comment.assignee_id,
      assignedDueAt: comment.assigned_due_at,
      assignedResolvedAt: comment.assigned_resolved_at,
      assignedResolvedBy: comment.assigned_resolved_by,
    },
  });
});

commentsRouter.delete('/:id/assign', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: { code: 'validation_error', message: 'id required' } });
    return;
  }
  const comment = await unassignComment(getAuth(req), id);
  res.json({
    comment: {
      id: comment.id,
      assigneeId: comment.assignee_id,
      assignedDueAt: comment.assigned_due_at,
      assignedResolvedAt: comment.assigned_resolved_at,
      assignedResolvedBy: comment.assigned_resolved_by,
    },
  });
});

commentsRouter.post('/:id/pin', async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(400).json({ error: { code: 'validation_error', message: 'id required' } }); return; }
  const comment = await pinComment(getAuth(req), id);
  res.json({ comment: { id: comment.id, pinnedAt: comment.pinned_at, pinnedBy: comment.pinned_by } });
});

commentsRouter.delete('/:id/pin', async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(400).json({ error: { code: 'validation_error', message: 'id required' } }); return; }
  const comment = await unpinComment(getAuth(req), id);
  res.json({ comment: { id: comment.id, pinnedAt: comment.pinned_at, pinnedBy: comment.pinned_by } });
});
