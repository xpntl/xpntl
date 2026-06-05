import {
  ALLOWED_REACTION_EMOJIS,
  UnauthorizedError,
  createComment,
  getWorkspaceUsersByIds,
  listCommentsForIssue,
  toggleReaction,
} from '@xpntl/domain';
import type { FullAuthContext } from '@xpntl/domain';
import { builder } from '../builder.js';

builder.objectType('Comment', {
  fields: (t) => ({
    id: t.exposeID('id'),
    issueId: t.id({ resolve: (c) => c.issue_id }),
    authorId: t.id({ resolve: (c) => c.author_id }),
    author: t.field({
      type: 'User',
      nullable: true,
      resolve: async (comment, _args, ctx) => {
        if (!ctx.auth) return null;
        const users = await getWorkspaceUsersByIds(ctx.auth as FullAuthContext, [comment.author_id]);
        return users.get(comment.author_id) ?? null;
      },
    }),
    body: t.exposeString('body'),
    mentionedUserIds: t.idList({ resolve: (c) => c.mentionedUserIds }),
    mentionedUsers: t.field({
      type: ['User'],
      resolve: async (comment, _args, ctx) => {
        if (!ctx.auth || comment.mentionedUserIds.length === 0) return [];
        const users = await getWorkspaceUsersByIds(ctx.auth as FullAuthContext, comment.mentionedUserIds);
        return comment.mentionedUserIds.flatMap((id) => {
          const user = users.get(id);
          return user ? [user] : [];
        });
      },
    }),
    editedAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (c) => c.edited_at,
    }),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (c) => c.created_at,
    }),
  }),
});

builder.queryFields((t) => ({
  comments: t.field({
    type: ['Comment'],
    args: {
      issueKey: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.auth) throw new UnauthorizedError();
      return listCommentsForIssue(ctx.auth as FullAuthContext, args.issueKey);
    },
  }),
}));

builder.mutationFields((t) => ({
  createComment: t.field({
    type: 'Comment',
    args: {
      issueKey: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
      mentionedUserIds: t.arg.idList({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.auth) throw new UnauthorizedError();
      return createComment({
        ctx: ctx.auth as FullAuthContext,
        issueKey: args.issueKey,
        body: args.body,
        mentionedUserIds: args.mentionedUserIds?.map(String),
      });
    },
  }),
  toggleCommentReaction: t.boolean({
    description: `Returns true if the reaction was added, false if removed. Allowed emojis: ${ALLOWED_REACTION_EMOJIS.join(' ')}`,
    args: {
      commentId: t.arg.id({ required: true }),
      emoji: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.auth) throw new UnauthorizedError();
      const result = await toggleReaction({
        ctx: ctx.auth as FullAuthContext,
        targetType: 'comment',
        targetId: String(args.commentId),
        emoji: args.emoji,
      });
      return result.added;
    },
  }),
}));
