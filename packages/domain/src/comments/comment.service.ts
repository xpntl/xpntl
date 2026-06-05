import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { logActivityOnClient } from '../issues/issue-activity.service.js';
import { notifyQuietly } from '../notifications/notification.service.js';
import { dispatchWebhookEvent } from '../webhooks/webhook.service.js';
import type { FullAuthContext, CommentRow, IssueRow } from '../types.js';

const MENTION_RE = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

export type CreateCommentInput = {
  ctx: FullAuthContext;
  issueKey: string;
  body: string;
  /** Explicit mention user IDs from the rich-text editor (TipTap @mentions). */
  mentionedUserIds?: string[];
};

export type CommentWithMentions = CommentRow & { mentionedUserIds: string[] };

export async function createComment(input: CreateCommentInput): Promise<CommentWithMentions> {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 50_000) {
    throw new ValidationError('Comment body must be 1-50000 characters');
  }

  // Resolve the issue (tenant-scoped) so we can attach by issue_id.
  const issueResult = await tenantPoolQuery<IssueRow>(
    input.ctx.workspace.id,
    `SELECT id FROM issues WHERE {TENANT} AND key = $1`,
    [input.issueKey],
  );
  const issue = issueResult.rows[0];
  if (!issue) throw new NotFoundError(`Issue ${input.issueKey} not found`);

  const created = await withTransaction(async (client) => {
    const commentResult = await client.query<CommentRow>(
      `INSERT INTO comments (id, workspace_id, issue_id, author_id, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [newId(), input.ctx.workspace.id, issue.id, input.ctx.user.id, body],
    );
    const comment = commentResult.rows[0];
    if (!comment) throw new Error('Failed to create comment');

    // Resolve mentioned user IDs — prefer explicit IDs from the rich-text
    // editor (@mention nodes), fall back to legacy @email regex extraction.
    let mentionedUserIds: string[] = [];
    if (input.mentionedUserIds && input.mentionedUserIds.length > 0) {
      // Validate that all supplied IDs exist in the workspace.
      const validateResult = await tenantClientQuery<{ id: string }>(
        client,
        input.ctx.workspace.id,
        `SELECT id FROM users WHERE {TENANT} AND id = ANY($1::text[])`,
        [input.mentionedUserIds],
      );
      mentionedUserIds = validateResult.rows.map((r) => r.id);
    } else {
      const mentionedEmails = extractMentionEmails(body);
      if (mentionedEmails.length > 0) {
        const mentionResult = await tenantClientQuery<{ id: string }>(
          client,
          input.ctx.workspace.id,
          `SELECT id FROM users WHERE {TENANT} AND lower(email) = ANY($1::text[])`,
          [mentionedEmails.map((e) => e.toLowerCase())],
        );
        mentionedUserIds = mentionResult.rows.map((r) => r.id);
      }
    }

    if (mentionedUserIds.length > 0) {
      for (const userId of mentionedUserIds) {
        await client.query(
          `INSERT INTO comment_mentions (comment_id, workspace_id, mentioned_user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [comment.id, input.ctx.workspace.id, userId],
        );
      }
    }

    await recordOnClient(client, {
      workspaceId: input.ctx.workspace.id,
      actorUserId: input.ctx.user.id,
      eventType: 'comment.created',
      targetType: 'comment',
      targetId: comment.id,
      metadata: { issueId: issue.id, mentionCount: mentionedUserIds.length },
    });

    await logActivityOnClient(client, {
      issueId: issue.id,
      workspaceId: input.ctx.workspace.id,
      actorId: input.ctx.user.id,
      action: 'comment_added',
      newValue: { commentId: comment.id, bodyPreview: body.slice(0, 200) },
    });

    // --- Notification triggers (fire-and-forget) ---
    const actorName = input.ctx.user.display_name ?? input.ctx.user.email;
    const notified = new Set<string>();

    // TEMP DEBUG (XP-105 diag): log the fanout shape so we can see what's happening in prod.
    console.log('[notify-debug:comment]', JSON.stringify({
      issueKey: input.issueKey,
      issueId: issue.id,
      actorId: input.ctx.user.id,
      workspaceId: input.ctx.workspace.id,
      mentionedUserIds,
    }));

    // Notify mentioned users
    for (const userId of mentionedUserIds) {
      if (userId === input.ctx.user.id) continue;
      notified.add(userId);
      console.log('[notify-debug:mention]', JSON.stringify({ to: userId, type: 'mention', issueKey: input.issueKey }));
      notifyQuietly({
        workspaceId: input.ctx.workspace.id,
        userId,
        type: 'mention',
        title: `${actorName} mentioned you on ${input.issueKey}`,
        body: body.slice(0, 200),
        issueId: issue.id,
        commentId: comment.id,
        actorId: input.ctx.user.id,
      });
    }

    // Notify every issue assignee (legacy single + issue_assignees multi)
    // PLUS the issue creator — they reported it, they care about activity on
    // it even when not assigned. Excludes the commenter and anyone already
    // notified via @mention. XP-102.
    const assigneesRes = await client.query<{ user_id: string }>(
      `SELECT user_id FROM issue_assignees WHERE issue_id = $1`,
      [issue.id],
    );
    const recipients = new Set(assigneesRes.rows.map((r) => r.user_id));
    const issueMeta = await tenantClientQuery<IssueRow>(
      client,
      input.ctx.workspace.id,
      `SELECT assignee_id, creator_id FROM issues WHERE {TENANT} AND id = $1`,
      [issue.id],
    );
    const legacyAssigneeId = issueMeta.rows[0]?.assignee_id;
    if (legacyAssigneeId) recipients.add(legacyAssigneeId);
    const creatorId = issueMeta.rows[0]?.creator_id;
    if (creatorId) recipients.add(creatorId);
    console.log('[notify-debug:recipients]', JSON.stringify({
      issueKey: input.issueKey,
      assignees: assigneesRes.rows.map((r) => r.user_id),
      legacyAssigneeId: legacyAssigneeId ?? null,
      creatorId: creatorId ?? null,
      recipientsSet: [...recipients],
      alreadyNotified: [...notified],
    }));
    for (const userId of recipients) {
      if (userId === input.ctx.user.id || notified.has(userId)) continue;
      notified.add(userId);
      console.log('[notify-debug:comment-fanout]', JSON.stringify({ to: userId, type: 'comment', issueKey: input.issueKey }));
      notifyQuietly({
        workspaceId: input.ctx.workspace.id,
        userId,
        type: 'comment',
        title: `${actorName} commented on ${input.issueKey}`,
        body: body.slice(0, 200),
        issueId: issue.id,
        commentId: comment.id,
        actorId: input.ctx.user.id,
      });
    }

    return { ...comment, mentionedUserIds };
  });

  dispatchWebhookEvent(input.ctx.workspace.id, 'comment.created', {
    comment: { id: created.id, issueId: created.issue_id },
    issueKey: input.issueKey,
    actor: { id: input.ctx.user.id, email: input.ctx.user.email },
  }).catch(() => {});

  return created;
}

export async function listCommentsForIssue(
  ctx: FullAuthContext,
  issueKey: string,
): Promise<CommentWithMentions[]> {
  const issueResult = await tenantPoolQuery<IssueRow>(
    ctx.workspace.id,
    `SELECT id FROM issues WHERE {TENANT} AND key = $1`,
    [issueKey],
  );
  const issue = issueResult.rows[0];
  if (!issue) throw new NotFoundError(`Issue ${issueKey} not found`);

  const commentsResult = await tenantPoolQuery<CommentRow>(
    ctx.workspace.id,
    `SELECT * FROM comments WHERE {TENANT} AND issue_id = $1 ORDER BY created_at ASC`,
    [issue.id],
  );
  const comments = commentsResult.rows;
  if (comments.length === 0) return [];

  const mentionsResult = await tenantPoolQuery<{ comment_id: string; mentioned_user_id: string }>(
    ctx.workspace.id,
    `SELECT comment_id, mentioned_user_id FROM comment_mentions
      WHERE {TENANT} AND comment_id = ANY($1::text[])`,
    [comments.map((c) => c.id)],
  );
  const byCommentId = new Map<string, string[]>();
  for (const row of mentionsResult.rows) {
    const list = byCommentId.get(row.comment_id) ?? [];
    list.push(row.mentioned_user_id);
    byCommentId.set(row.comment_id, list);
  }

  return comments.map((c) => ({
    ...c,
    mentionedUserIds: byCommentId.get(c.id) ?? [],
  }));
}

export async function deleteComment(ctx: FullAuthContext, commentId: string): Promise<void> {
  // Author or Admin+ may delete.
  const { rows } = await tenantPoolQuery<CommentRow>(
    ctx.workspace.id,
    `SELECT * FROM comments WHERE {TENANT} AND id = $1`,
    [commentId],
  );
  const comment = rows[0];
  if (!comment) throw new NotFoundError('Comment not found');

  const isAuthor = comment.author_id === ctx.user.id;
  const isAdmin = isAtLeast(ctx.user.role, 'Admin');
  if (!isAuthor && !isAdmin) {
    throw new ForbiddenError('You cannot delete this comment');
  }

  await withTransaction(async (client) => {
    await tenantClientQuery(
      client,
      ctx.workspace.id,
      `DELETE FROM comments WHERE {TENANT} AND id = $1`,
      [commentId],
    );
    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'comment.deleted',
      targetType: 'comment',
      targetId: commentId,
      metadata: { issueId: comment.issue_id, authorWasSelf: isAuthor },
    });
  });
}

// ---- Thread resolve (Google-Docs-style collapse) ---------------------------

export async function resolveComment(
  ctx: FullAuthContext,
  commentId: string,
): Promise<CommentRow> {
  const { rows } = await getPool().query<CommentRow>(
    `SELECT c.*, i.assignee_id AS _issue_assignee_id
       FROM comments c
       JOIN issues i ON i.id = c.issue_id
      WHERE c.workspace_id = $1 AND c.id = $2`,
    [ctx.workspace.id, commentId],
  );
  const comment = rows[0] as (CommentRow & { _issue_assignee_id: string | null }) | undefined;
  if (!comment) throw new NotFoundError('Comment not found');

  const isAuthor = comment.author_id === ctx.user.id;
  const isAssignee = comment._issue_assignee_id === ctx.user.id;
  const isAdmin = isAtLeast(ctx.user.role, 'Admin');
  if (!isAuthor && !isAssignee && !isAdmin) {
    throw new ForbiddenError('You cannot resolve this comment');
  }

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(
      client,
      ctx.workspace.id,
      `UPDATE comments
         SET resolved_at = NOW(),
             resolved_by = $1
       WHERE {TENANT} AND id = $2
       RETURNING *`,
      [ctx.user.id, commentId],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to resolve comment');

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'comment.thread_resolved',
      targetType: 'comment',
      targetId: commentId,
      metadata: { issueId: comment.issue_id },
    });

    await logActivityOnClient(client, {
      issueId: comment.issue_id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: 'comment_resolved',
      newValue: { commentId },
    });

    return updated;
  });
}

export async function unresolveComment(
  ctx: FullAuthContext,
  commentId: string,
): Promise<CommentRow> {
  const { rows } = await getPool().query<CommentRow>(
    `SELECT c.*, i.assignee_id AS _issue_assignee_id
       FROM comments c
       JOIN issues i ON i.id = c.issue_id
      WHERE c.workspace_id = $1 AND c.id = $2`,
    [ctx.workspace.id, commentId],
  );
  const comment = rows[0] as (CommentRow & { _issue_assignee_id: string | null }) | undefined;
  if (!comment) throw new NotFoundError('Comment not found');

  const isAuthor = comment.author_id === ctx.user.id;
  const isAssignee = comment._issue_assignee_id === ctx.user.id;
  const isAdmin = isAtLeast(ctx.user.role, 'Admin');
  if (!isAuthor && !isAssignee && !isAdmin) {
    throw new ForbiddenError('You cannot unresolve this comment');
  }

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(
      client,
      ctx.workspace.id,
      `UPDATE comments
         SET resolved_at = NULL,
             resolved_by = NULL
       WHERE {TENANT} AND id = $1
       RETURNING *`,
      [commentId],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to unresolve comment');

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'comment.thread_unresolved',
      targetType: 'comment',
      targetId: commentId,
      metadata: { issueId: comment.issue_id },
    });

    return updated;
  });
}

// ---- Assigned comments (comment-as-task) ------------------------------------

export async function assignComment(
  ctx: FullAuthContext,
  commentId: string,
  assigneeId: string,
  dueAt?: string | null,
): Promise<CommentRow> {
  const { rows } = await tenantPoolQuery<CommentRow>(
    ctx.workspace.id,
    `SELECT * FROM comments WHERE {TENANT} AND id = $1`,
    [commentId],
  );
  if (!rows[0]) throw new NotFoundError('Comment not found');

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(
      client,
      ctx.workspace.id,
      `UPDATE comments
         SET assignee_id = $1, assigned_due_at = $2,
             assigned_resolved_at = NULL, assigned_resolved_by = NULL
       WHERE {TENANT} AND id = $3 RETURNING *`,
      [assigneeId, dueAt ?? null, commentId],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to assign comment');
    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'comment.assigned',
      targetType: 'comment',
      targetId: commentId,
      metadata: { assigneeId, dueAt: dueAt ?? null },
    });
    return updated;
  });
}

export async function resolveAssignedComment(
  ctx: FullAuthContext,
  commentId: string,
): Promise<CommentRow> {
  const { rows } = await tenantPoolQuery<CommentRow>(
    ctx.workspace.id,
    `SELECT * FROM comments WHERE {TENANT} AND id = $1`,
    [commentId],
  );
  const comment = rows[0];
  if (!comment) throw new NotFoundError('Comment not found');
  if (!comment.assignee_id) throw new ValidationError('Comment is not assigned');

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(
      client,
      ctx.workspace.id,
      `UPDATE comments
         SET assigned_resolved_at = NOW(), assigned_resolved_by = $1
       WHERE {TENANT} AND id = $2 RETURNING *`,
      [ctx.user.id, commentId],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to resolve assigned comment');
    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'comment.assignment_resolved',
      targetType: 'comment',
      targetId: commentId,
      metadata: {},
    });
    return updated;
  });
}

export async function unassignComment(
  ctx: FullAuthContext,
  commentId: string,
): Promise<CommentRow> {
  const { rows } = await tenantPoolQuery<CommentRow>(
    ctx.workspace.id,
    `SELECT * FROM comments WHERE {TENANT} AND id = $1`,
    [commentId],
  );
  if (!rows[0]) throw new NotFoundError('Comment not found');

  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(
      client,
      ctx.workspace.id,
      `UPDATE comments
         SET assignee_id = NULL, assigned_due_at = NULL,
             assigned_resolved_at = NULL, assigned_resolved_by = NULL
       WHERE {TENANT} AND id = $1 RETURNING *`,
      [commentId],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to unassign comment');
    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'comment.unassigned',
      targetType: 'comment',
      targetId: commentId,
      metadata: {},
    });
    return updated;
  });
}


// ---- Pinned comments ---------------------------------------------------------

export async function pinComment(ctx: FullAuthContext, commentId: string): Promise<CommentRow> {
  const { rows } = await tenantPoolQuery<CommentRow>(ctx.workspace.id, `SELECT * FROM comments WHERE {TENANT} AND id = $1`, [commentId]);
  const comment = rows[0];
  if (!comment) throw new NotFoundError('Comment not found');
  const issueResult = await tenantPoolQuery<IssueRow>(ctx.workspace.id, `SELECT * FROM issues WHERE {TENANT} AND id = $1`, [comment.issue_id]);
  const issue = issueResult.rows[0];
  const isAuthor = comment.author_id === ctx.user.id;
  const isAssignee = issue?.assignee_id === ctx.user.id;
  const isAdmin = isAtLeast(ctx.user.role, 'Admin');
  if (!isAuthor && !isAssignee && !isAdmin) throw new ForbiddenError('You cannot pin this comment');
  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(client, ctx.workspace.id, `UPDATE comments SET pinned_at = NOW(), pinned_by = $1 WHERE {TENANT} AND id = $2 RETURNING *`, [ctx.user.id, commentId]);
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to pin comment');
    await recordOnClient(client, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, eventType: 'comment.pinned', targetType: 'comment', targetId: commentId, metadata: { issueId: comment.issue_id } });
    return updated;
  });
}

export async function unpinComment(ctx: FullAuthContext, commentId: string): Promise<CommentRow> {
  const { rows } = await tenantPoolQuery<CommentRow>(ctx.workspace.id, `SELECT * FROM comments WHERE {TENANT} AND id = $1`, [commentId]);
  const comment = rows[0];
  if (!comment) throw new NotFoundError('Comment not found');
  const issueResult = await tenantPoolQuery<IssueRow>(ctx.workspace.id, `SELECT * FROM issues WHERE {TENANT} AND id = $1`, [comment.issue_id]);
  const issue = issueResult.rows[0];
  const isAuthor = comment.author_id === ctx.user.id;
  const isAssignee = issue?.assignee_id === ctx.user.id;
  const isAdmin = isAtLeast(ctx.user.role, 'Admin');
  if (!isAuthor && !isAssignee && !isAdmin) throw new ForbiddenError('You cannot unpin this comment');
  return withTransaction(async (client) => {
    const result = await tenantClientQuery<CommentRow>(client, ctx.workspace.id, `UPDATE comments SET pinned_at = NULL, pinned_by = NULL WHERE {TENANT} AND id = $1 RETURNING *`, [commentId]);
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to unpin comment');
    await recordOnClient(client, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, eventType: 'comment.unpinned', targetType: 'comment', targetId: commentId, metadata: { issueId: comment.issue_id } });
    return updated;
  });
}

function extractMentionEmails(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    if (match[1]) seen.add(match[1]);
  }
  return [...seen];
}
