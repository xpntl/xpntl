import {
  type CommentRow,
  type IssueFilter,
  type IssuePatch,
  type IssueRelationWithKey,
  type IssueRow,
  type IssueSort,
  type LabelRow,
  type ReactionSummary,
  type RelationType,
  type SubIssueCount,
  type UserRow,
  addIssueAssignee,
  archiveIssue,
  assigneesForIssues,
  attachLabelToIssue,
  bulkUpdateIssues,
  checklistProgressForIssues,
  clearRecurrence,
  createComment,
  createIssue,
  createRelation,
  deleteRelation,
  detachLabelFromIssue,
  getIssueByKey,
  getLastUsedProjectId,
  getWorkspaceUsersByIds,
  labelsForIssues,
  listArchivedIssues,
  listCommentsForIssue,
  listDeletedIssues,
  listIssues,
  listRelationsForIssue,
  listSubIssues,
  moveIssueToProject,
  navCounts,
  removeIssueAssignee,
  resolveComment,
  restoreIssue,
  setIssueAssignees,
  setRecurrence,
  softDeleteIssue,
  subIssueCounts,
  summarizeReactions,
  tagIssue,
  tagsForIssues,
  toggleReaction,
  unarchiveIssue,
  unresolveComment,
  untagIssue,
  updateIssue,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';
import { toLabelJson } from './labels.js';

export const issuesRouter: Router = Router();

issuesRouter.use(requireFullAuth);

const createIssueSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  type: z.string().min(1).max(40).optional(),
  stateId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
});

const moveIssueSchema = z.object({
  targetProjectId: z.string().min(1),
});

const updateIssueSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(50_000).nullable().optional(),
    stateId: z.string().min(1).optional(),
    priority: z.number().int().min(0).max(4).optional(),
    type: z.string().min(1).max(40).optional(),
    blocked: z.boolean().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    listId: z.string().min(1).nullable().optional(),
    milestoneId: z.string().min(1).nullable().optional(),
    coverBlobRef: z.string().max(500).nullable().optional(),
    coverPosition: z.number().min(0).max(100).optional(),
    startDate: z.string().min(1).nullable().optional(),
    dueDate: z.string().min(1).nullable().optional(),
    sortOrder: z.number().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.stateId !== undefined ||
      v.priority !== undefined ||
      v.type !== undefined ||
      v.blocked !== undefined ||
      v.assigneeId !== undefined ||
      v.parentId !== undefined ||
      v.listId !== undefined ||
      v.milestoneId !== undefined ||
      v.coverBlobRef !== undefined ||
      v.coverPosition !== undefined ||
      v.startDate !== undefined ||
      v.dueDate !== undefined ||
      v.sortOrder !== undefined,
    { message: 'patch must include at least one field' },
  );

const createCommentSchema = z.object({
  body: z.string().min(1).max(50_000),
  mentionedUserIds: z.array(z.string().min(1).max(64)).max(50).optional(),
});

const bulkUpdateIssueSchema = z.object({
  keys: z.array(z.string().min(1).max(64)).min(1).max(200),
  patch: updateIssueSchema,
});

const toggleReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

const ALLOWED_SORTS: Readonly<IssueSort[]> = [
  'manual',
  'created_desc',
  'created_asc',
  'updated_desc',
  'priority_asc',
  'key_asc',
];

// ---- Issue list + create -----------------------------------------------------

issuesRouter.get('/', async (req, res) => {
  const filter = parseFilterFromQuery(req.query, getAuth(req).user.id);
  const sortParam = String(req.query.sort ?? 'manual');
  const sort = (ALLOWED_SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as IssueSort)
    : 'manual';

  const issues = await listIssues({ ctx: getAuth(req), filter, sort });
  const ids = issues.map((i) => i.id);
  const [labelMap, tagMap, subCounts, assigneeMap, clProgress] = await Promise.all([
    labelsForIssues(getAuth(req), ids),
    tagsForIssues(getAuth(req), ids),
    subIssueCounts(getAuth(req), ids),
    assigneesForIssues(getAuth(req), ids),
    checklistProgressForIssues(getAuth(req), ids),
  ]);
  // userMap must cover creators, the legacy single assignee, and every
  // multi-assignee (XP-72).
  const userMap = await getWorkspaceUsersByIds(
    getAuth(req),
    issues.flatMap((issue) => [
      issue.creator_id,
      issue.assignee_id ?? '',
      ...(assigneeMap.get(issue.id) ?? []).map((a) => a.user_id),
    ]),
  );
  res.json({
    issues: issues.map((iss) => {
      const progress = clProgress.get(iss.id);
      const checklistProgress = progress
        ? progress.reduce(
            (acc, p) => ({ total: acc.total + p.total, checked: acc.checked + p.checked }),
            { total: 0, checked: 0 },
          )
        : undefined;
      const assigneeIds = (assigneeMap.get(iss.id) ?? []).map((a) => a.user_id);
      return {
        ...toIssueJson(iss, userMap, assigneeIds.length > 0 ? assigneeIds : undefined),
        labels: (labelMap.get(iss.id) ?? []).map(toLabelJson),
        tags: (tagMap.get(iss.id) ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
        subIssueCount: subCounts.get(iss.id)
          ? toSubIssueCountJson(subCounts.get(iss.id)!)
          : undefined,
        checklistProgress: checklistProgress?.total ? checklistProgress : undefined,
      };
    }),
  });
});

issuesRouter.post('/', async (req, res) => {
  const input = createIssueSchema.parse(req.body);
  const issue = await createIssue({
    ctx: getAuth(req),
    title: input.title,
    description: input.description,
    priority: input.priority,
    type: input.type,
    stateId: input.stateId,
    assigneeId: input.assigneeId,
    projectId: input.projectId,
    parentId: input.parentId,
  });
  const userMap = await getWorkspaceUsersByIds(getAuth(req), [issue.creator_id]);
  res.status(201).json({ issue: toIssueJson(issue, userMap) });
});

issuesRouter.patch('/bulk', async (req, res) => {
  const input = bulkUpdateIssueSchema.parse(req.body);
  const issues = await bulkUpdateIssues({
    ctx: getAuth(req),
    keys: input.keys,
    patch: input.patch,
  });
  const userMap = await getWorkspaceUsersByIds(
    getAuth(req),
    issues.flatMap((issue) => [issue.creator_id, issue.assignee_id ?? '']),
  );
  res.json({ issues: issues.map((issue) => toIssueJson(issue, userMap)) });
});

issuesRouter.get('/counts', async (req, res, next) => {
  try {
    const counts = await navCounts(getAuth(req));
    res.json(counts);
  } catch (err) {
    next(err);
  }
});

issuesRouter.get('/last-used-project', async (req, res) => {
  const projectId = await getLastUsedProjectId(getAuth(req));
  res.json({ projectId });
});

issuesRouter.put('/:key/move', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const input = moveIssueSchema.parse(req.body);
  const issue = await moveIssueToProject({
    ctx: getAuth(req),
    key,
    targetProjectId: input.targetProjectId,
  });
  const userMap = await getWorkspaceUsersByIds(getAuth(req), [
    issue.creator_id,
    issue.assignee_id ?? '',
  ]);
  res.json({ issue: toIssueJson(issue, userMap) });
});

issuesRouter.get('/deleted', async (req, res) => {
  const issues = await listDeletedIssues(getAuth(req));
  const userMap = await getWorkspaceUsersByIds(
    getAuth(req),
    issues.flatMap((issue) => [issue.creator_id, issue.assignee_id ?? '']),
  );
  res.json({ issues: issues.map((issue) => toIssueJson(issue, userMap)) });
});

issuesRouter.get('/archived', async (req, res) => {
  const projectId = stringOrUndefined(req.query.projectId);
  const issues = await listArchivedIssues(getAuth(req), projectId);
  const userMap = await getWorkspaceUsersByIds(
    getAuth(req),
    issues.flatMap((issue) => [issue.creator_id, issue.assignee_id ?? '']),
  );
  res.json({ issues: issues.map((issue) => toIssueJson(issue, userMap)) });
});

// ---- Single issue ------------------------------------------------------------

issuesRouter.delete('/:key', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  await softDeleteIssue(getAuth(req), key);
  res.status(204).end();
});

issuesRouter.post('/:key/restore', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const issue = await restoreIssue(getAuth(req), key);
  res.json({ issue: toIssueJson(issue) });
});

issuesRouter.post('/:key/archive', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const issue = await archiveIssue(getAuth(req), key);
  res.json({ issue: toIssueJson(issue) });
});

issuesRouter.post('/:key/unarchive', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const issue = await unarchiveIssue(getAuth(req), key);
  res.json({ issue: toIssueJson(issue) });
});

issuesRouter.patch('/:key', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const patch: IssuePatch = updateIssueSchema.parse(req.body);
  const issue = await updateIssue({ ctx: getAuth(req), key, patch });
  const userMap = await getWorkspaceUsersByIds(getAuth(req), [
    issue.creator_id,
    issue.assignee_id ?? '',
  ]);
  res.json({ issue: toIssueJson(issue, userMap) });
});

issuesRouter.get('/:key', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  const [reactions, labelMap, tagMap, subCounts, relations, userMap] = await Promise.all([
    summarizeReactions(getAuth(req), 'issue', [issue.id]),
    labelsForIssues(getAuth(req), [issue.id]),
    tagsForIssues(getAuth(req), [issue.id]),
    subIssueCounts(getAuth(req), [issue.id]),
    listRelationsForIssue(getAuth(req), issue.id),
    getWorkspaceUsersByIds(getAuth(req), [issue.creator_id, issue.assignee_id ?? '']),
  ]);
  res.json({
    issue: {
      ...toIssueJson(issue, userMap),
      labels: (labelMap.get(issue.id) ?? []).map(toLabelJson),
      tags: (tagMap.get(issue.id) ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
      subIssueCount: subCounts.get(issue.id)
        ? toSubIssueCountJson(subCounts.get(issue.id)!)
        : undefined,
    },
    reactions: (reactions.get(issue.id) ?? []).map(toReactionJson),
    relations: relations.map(toRelationJson),
  });
});

issuesRouter.get('/:key/sub-issues', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const subIssues = await listSubIssues(getAuth(req), key);
  const ids = subIssues.map((i) => i.id);
  const [labelMap, tagMap, userMap] = await Promise.all([
    labelsForIssues(getAuth(req), ids),
    tagsForIssues(getAuth(req), ids),
    getWorkspaceUsersByIds(
      getAuth(req),
      subIssues.flatMap((issue) => [issue.creator_id, issue.assignee_id ?? '']),
    ),
  ]);
  res.json({
    issues: subIssues.map((iss) => ({
      ...toIssueJson(iss, userMap),
      labels: (labelMap.get(iss.id) ?? []).map(toLabelJson),
      tags: (tagMap.get(iss.id) ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    })),
  });
});

const attachLabelSchema = z.object({
  labelId: z.string().uuid('labelId must be a UUID'),
});

issuesRouter.post('/:key/labels', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const input = attachLabelSchema.parse(req.body);
  const issue = await getIssueByKey(getAuth(req), key);
  await attachLabelToIssue({ ctx: getAuth(req), issueId: issue.id, labelId: input.labelId });
  const labelMap = await labelsForIssues(getAuth(req), [issue.id]);
  res.status(201).json({
    labels: (labelMap.get(issue.id) ?? []).map(toLabelJson),
  });
});

issuesRouter.delete('/:key/labels/:labelId', async (req, res) => {
  const key = req.params.key;
  const labelId = req.params.labelId;
  if (!key || !labelId) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'key and labelId required' },
    });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  await detachLabelFromIssue({ ctx: getAuth(req), issueId: issue.id, labelId });
  const labelMap = await labelsForIssues(getAuth(req), [issue.id]);
  res.json({
    labels: (labelMap.get(issue.id) ?? []).map(toLabelJson),
  });
});

issuesRouter.post('/:key/tags', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const { tagId } = z.object({ tagId: z.string().min(1) }).parse(req.body);
  const issue = await getIssueByKey(getAuth(req), key);
  await tagIssue({ ctx: getAuth(req), issueId: issue.id, tagId });
  const tagMap = await tagsForIssues(getAuth(req), [issue.id]);
  res.status(201).json({
    tags: (tagMap.get(issue.id) ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
  });
});

issuesRouter.delete('/:key/tags/:tagId', async (req, res) => {
  const key = req.params.key;
  const tagId = req.params.tagId;
  if (!key || !tagId) {
    res
      .status(400)
      .json({ error: { code: 'validation_error', message: 'key and tagId required' } });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  await untagIssue({ ctx: getAuth(req), issueId: issue.id, tagId });
  const tagMap = await tagsForIssues(getAuth(req), [issue.id]);
  res.json({
    tags: (tagMap.get(issue.id) ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
  });
});

const setAssigneesSchema = z.object({
  userIds: z.array(z.string().min(1)).max(20),
});

issuesRouter.put('/:key/assignees', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const input = setAssigneesSchema.parse(req.body);
  const issue = await getIssueByKey(getAuth(req), key);
  const assignees = await setIssueAssignees({
    ctx: getAuth(req),
    issueId: issue.id,
    userIds: input.userIds,
  });
  res.json({
    assignees: assignees.map((a) => ({
      userId: a.user_id,
      position: a.position,
      assignedAt: a.assigned_at,
    })),
  });
});

issuesRouter.post('/:key/assignees', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
  const issue = await getIssueByKey(getAuth(req), key);
  await addIssueAssignee({ ctx: getAuth(req), issueId: issue.id, userId });
  res.status(201).json({ ok: true });
});

issuesRouter.delete('/:key/assignees/:userId', async (req, res) => {
  const key = req.params.key;
  const userId = req.params.userId;
  if (!key || !userId) {
    res
      .status(400)
      .json({ error: { code: 'validation_error', message: 'key and userId required' } });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  await removeIssueAssignee({ ctx: getAuth(req), issueId: issue.id, userId });
  res.json({ ok: true });
});

issuesRouter.post('/:key/reactions/toggle', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const input = toggleReactionSchema.parse(req.body);
  const issue = await getIssueByKey(getAuth(req), key);
  const result = await toggleReaction({
    ctx: getAuth(req),
    targetType: 'issue',
    targetId: issue.id,
    emoji: input.emoji,
  });
  res.json(result);
});

// ---- Relations --------------------------------------------------------------

const createRelationSchema = z.object({
  toIssueKey: z.string().min(1),
  type: z.enum(['blocks', 'blocked_by', 'relates_to', 'duplicate_of', 'duplicated_by']),
});

issuesRouter.get('/:key/relations', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  const relations = await listRelationsForIssue(getAuth(req), issue.id);
  res.json({ relations: relations.map(toRelationJson) });
});

issuesRouter.post('/:key/relations', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const input = createRelationSchema.parse(req.body);
  const fromIssue = await getIssueByKey(getAuth(req), key);
  const toIssue = await getIssueByKey(getAuth(req), input.toIssueKey);
  const relation = await createRelation({
    ctx: getAuth(req),
    fromIssueId: fromIssue.id,
    toIssueId: toIssue.id,
    type: input.type,
  });
  res.status(201).json({
    relation: { ...relation, relatedIssueKey: toIssue.key, relatedIssueTitle: toIssue.title },
  });
});

issuesRouter.delete('/:key/relations', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const { toIssueKey, type } = z
    .object({
      toIssueKey: z.string().min(1),
      type: z.enum(['blocks', 'blocked_by', 'relates_to', 'duplicate_of', 'duplicated_by']),
    })
    .parse(req.body);
  const fromIssue = await getIssueByKey(getAuth(req), key);
  const toIssue = await getIssueByKey(getAuth(req), toIssueKey);
  await deleteRelation({
    ctx: getAuth(req),
    fromIssueId: fromIssue.id,
    toIssueId: toIssue.id,
    type,
  });
  res.status(204).end();
});

// ---- Recurrence -------------------------------------------------------------

const setRecurrenceSchema = z.object({
  rule: z.string().min(1).max(200),
  active: z.boolean().optional(),
});

issuesRouter.post('/:key/recurrence', async (req, res) => {
  const key = String(req.params.key);
  const input = setRecurrenceSchema.parse(req.body);
  const issue = await setRecurrence(getAuth(req), key, input);
  const userMap = await getWorkspaceUsersByIds(getAuth(req), [issue.creator_id]);
  res.json({ issue: toIssueJson(issue, userMap) });
});

issuesRouter.delete('/:key/recurrence', async (req, res) => {
  const key = String(req.params.key);
  await clearRecurrence(getAuth(req), key);
  res.status(204).end();
});

// ---- Comments ---------------------------------------------------------------

issuesRouter.get('/:key/comments', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const comments = await listCommentsForIssue(getAuth(req), key);
  const [reactions, userMap] = await Promise.all([
    summarizeReactions(
      getAuth(req),
      'comment',
      comments.map((c) => c.id),
    ),
    getWorkspaceUsersByIds(
      getAuth(req),
      comments.flatMap((comment) => [
        comment.author_id,
        ...comment.mentionedUserIds,
        ...(comment.pinned_by ? [comment.pinned_by] : []),
        ...(comment.assignee_id ? [comment.assignee_id] : []),
      ]),
    ),
  ]);
  res.json({
    comments: comments.map((c) => ({
      ...toCommentJson(c, userMap),
      reactions: (reactions.get(c.id) ?? []).map(toReactionJson),
    })),
  });
});

issuesRouter.post('/:key/comments', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    res.status(400).json({ error: { code: 'validation_error', message: 'key required' } });
    return;
  }
  const input = createCommentSchema.parse(req.body);
  const comment = await createComment({
    ctx: getAuth(req),
    issueKey: key,
    body: input.body,
    mentionedUserIds: input.mentionedUserIds,
  });
  const userMap = await getWorkspaceUsersByIds(getAuth(req), [
    comment.author_id,
    ...comment.mentionedUserIds,
  ]);
  res.status(201).json({
    comment: { ...toCommentJson(comment, userMap), reactions: [] },
  });
});

// ---- Comment thread resolve / unresolve ------------------------------------

issuesRouter.post('/:key/comments/:commentId/resolve', async (req, res) => {
  const { commentId } = req.params;
  if (!commentId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'commentId required' } });
    return;
  }
  const updated = await resolveComment(getAuth(req), commentId);
  const userMap = await getWorkspaceUsersByIds(
    getAuth(req),
    [updated.author_id, updated.resolved_by ?? ''].filter(Boolean),
  );
  res.json({ comment: toCommentJson({ ...updated, mentionedUserIds: [] }, userMap) });
});

issuesRouter.delete('/:key/comments/:commentId/resolve', async (req, res) => {
  const { commentId } = req.params;
  if (!commentId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'commentId required' } });
    return;
  }
  const updated = await unresolveComment(getAuth(req), commentId);
  const userMap = await getWorkspaceUsersByIds(getAuth(req), [updated.author_id]);
  res.json({ comment: toCommentJson({ ...updated, mentionedUserIds: [] }, userMap) });
});

// ---- Helpers ----------------------------------------------------------------

const ALLOWED_STATE_TYPES = new Set([
  'triage',
  'backlog',
  'unstarted',
  'started',
  'review',
  'completed',
  'canceled',
]);

function parseFilterFromQuery(query: Record<string, unknown>, meUserId: string): IssueFilter {
  const filter: IssueFilter = {};

  const q = stringOrUndefined(query.q);
  if (q) filter.q = q;

  const stateIds = splitCsv(stringOrUndefined(query.state));
  if (stateIds.length > 0) filter.stateIds = stateIds;

  const stateTypes = splitCsv(stringOrUndefined(query.stateType)).filter((t) =>
    ALLOWED_STATE_TYPES.has(t),
  ) as IssueFilter['stateTypes'];
  if (stateTypes && stateTypes.length > 0) filter.stateTypes = stateTypes;

  const priorityCsv = splitCsv(stringOrUndefined(query.priority));
  if (priorityCsv.length > 0) {
    const priorities = priorityCsv
      .map((p) => Number.parseInt(p, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 4);
    if (priorities.length > 0) filter.priorities = priorities;
  }

  const assigneeCsv = splitCsv(stringOrUndefined(query.assignee));
  if (assigneeCsv.length > 0) {
    filter.assigneeIds = assigneeCsv.map((a) => (a === 'me' ? meUserId : a));
  }

  const projectId = stringOrUndefined(query.projectId);
  if (projectId) filter.projectId = projectId;

  const titleContains = stringOrUndefined(query.title);
  if (titleContains) filter.titleContains = titleContains;

  return filter;
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function splitCsv(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toSubIssueCountJson(c: SubIssueCount) {
  return {
    total: c.total,
    completed: c.completed,
    canceled: c.canceled,
    inProgress: c.inProgress,
    progress: c.progress,
  };
}

function toIssueJson(issue: IssueRow, userMap?: Map<string, UserRow>, assigneeIds?: string[]) {
  // Multi-assignee (XP-72): when the caller loaded issue_assignees, pass the
  // ordered user ids; otherwise fall back to the legacy single assignee_id so
  // every callsite stays correct without loading the join table.
  const ids = assigneeIds ?? (issue.assignee_id ? [issue.assignee_id] : []);
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    description: issue.description,
    stateId: issue.state_id,
    priority: issue.priority,
    type: issue.type,
    blocked: issue.blocked,
    assigneeId: issue.assignee_id,
    assignees: ids
      .map((uid) => toWorkspaceUserJson(userMap?.get(uid) ?? null))
      .filter((u): u is NonNullable<typeof u> => u !== null),
    creatorId: issue.creator_id,
    parentId: issue.parent_id,
    teamId: issue.team_id,
    projectId: issue.project_id,
    listId: issue.list_id,
    milestoneId: issue.milestone_id,
    coverBlobRef: issue.cover_blob_ref,
    coverPosition: issue.cover_position,
    startDate: issue.start_date,
    dueDate: issue.due_date,
    assignee: issue.assignee_id
      ? toWorkspaceUserJson(userMap?.get(issue.assignee_id) ?? null)
      : null,
    creator: toWorkspaceUserJson(userMap?.get(issue.creator_id) ?? null),
    recurrenceRule: issue.recurrence_rule,
    recurrenceActive: issue.recurrence_active,
    recurrenceNextAt: issue.recurrence_next_at,
    recurrenceSourceId: issue.recurrence_source_id,
    sortOrder: issue.sort_order,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

function toCommentJson(
  c: CommentRow & { mentionedUserIds: string[] },
  userMap?: Map<string, UserRow>,
) {
  return {
    id: c.id,
    issueId: c.issue_id,
    authorId: c.author_id,
    author: toWorkspaceUserJson(userMap?.get(c.author_id) ?? null),
    body: c.body,
    mentionedUserIds: c.mentionedUserIds,
    mentionedUsers: c.mentionedUserIds
      .map((id) => toWorkspaceUserJson(userMap?.get(id) ?? null))
      .filter(Boolean),
    editedAt: c.edited_at,
    resolvedAt: c.resolved_at,
    resolvedBy: c.resolved_by,
    pinnedAt: c.pinned_at,
    pinnedBy: c.pinned_by,
    pinnedByUser: c.pinned_by ? toWorkspaceUserJson(userMap?.get(c.pinned_by) ?? null) : null,
    createdAt: c.created_at,
    assigneeId: c.assignee_id,
    assignee: c.assignee_id ? toWorkspaceUserJson(userMap?.get(c.assignee_id) ?? null) : null,
    assignedDueAt: c.assigned_due_at,
    assignedResolvedAt: c.assigned_resolved_at,
    assignedResolvedBy: c.assigned_resolved_by,
  };
}

function toWorkspaceUserJson(user: UserRow | null) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    role: user.role,
    isAgent: user.is_agent,
    agentHarness: user.agent_harness,
    lastSeenAt: user.last_seen_at,
  };
}

function toRelationJson(r: IssueRelationWithKey) {
  return {
    id: r.id,
    fromIssueId: r.from_issue_id,
    toIssueId: r.to_issue_id,
    type: r.type,
    relatedIssueKey: r.related_issue_key,
    relatedIssueTitle: r.related_issue_title,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function toReactionJson(r: ReactionSummary) {
  return { emoji: r.emoji, count: r.count, mine: r.mine, userIds: r.userIds };
}
