import {
  type IssueFilter,
  type IssueSort,
  UnauthorizedError,
  createIssue,
  getWorkspaceUsersByIds,
  listIssues,
} from '@xpntl/domain';
import type { FullAuthContext } from '@xpntl/domain';
import { builder } from '../builder.js';

const SORT_VALUES: IssueSort[] = [
  'created_desc',
  'created_asc',
  'updated_desc',
  'priority_asc',
  'key_asc',
];

const IssueSortEnum = builder.enumType('IssueSort', {
  values: SORT_VALUES.reduce(
    (acc, v) => {
      acc[v] = { value: v };
      return acc;
    },
    {} as Record<string, { value: IssueSort }>,
  ),
});

const IssueFilterInput = builder.inputType('IssueFilterInput', {
  fields: (t) => ({
    q: t.string(),
    stateIds: t.idList(),
    priorities: t.intList(),
    assigneeIds: t.idList(),
    titleContains: t.string(),
  }),
});

builder.objectType('Issue', {
  fields: (t) => ({
    id: t.exposeID('id'),
    key: t.exposeString('key'),
    title: t.exposeString('title'),
    description: t.string({ nullable: true, resolve: (i) => i.description }),
    stateId: t.id({ resolve: (i) => i.state_id }),
    priority: t.exposeInt('priority'),
    type: t.exposeString('type'),
    blocked: t.exposeBoolean('blocked'),
    assigneeId: t.id({ nullable: true, resolve: (i) => i.assignee_id }),
    creatorId: t.id({ resolve: (i) => i.creator_id }),
    assignee: t.field({
      type: 'User',
      nullable: true,
      resolve: async (issue, _args, ctx) => {
        if (!ctx.auth || !issue.assignee_id) return null;
        const users = await getWorkspaceUsersByIds(ctx.auth as FullAuthContext, [issue.assignee_id]);
        return users.get(issue.assignee_id) ?? null;
      },
    }),
    creator: t.field({
      type: 'User',
      nullable: true,
      resolve: async (issue, _args, ctx) => {
        if (!ctx.auth) return null;
        const users = await getWorkspaceUsersByIds(ctx.auth as FullAuthContext, [issue.creator_id]);
        return users.get(issue.creator_id) ?? null;
      },
    }),
    createdAt: t.field({ type: 'DateTime', resolve: (i) => i.created_at }),
    updatedAt: t.field({ type: 'DateTime', resolve: (i) => i.updated_at }),
  }),
});

builder.queryFields((t) => ({
  issues: t.field({
    type: ['Issue'],
    description: "Issues in the authenticated user's workspace, optionally filtered.",
    args: {
      filter: t.arg({ type: IssueFilterInput }),
      sort: t.arg({ type: IssueSortEnum }),
      limit: t.arg.int(),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.auth) throw new UnauthorizedError();
      const filter: IssueFilter = {};
      if (args.filter?.q) filter.q = args.filter.q;
      if (args.filter?.stateIds) filter.stateIds = args.filter.stateIds.map(String);
      if (args.filter?.priorities) filter.priorities = args.filter.priorities;
      if (args.filter?.assigneeIds) {
        filter.assigneeIds = args.filter.assigneeIds.map((a) =>
          String(a) === 'me' ? (ctx.auth as FullAuthContext).user.id : String(a),
        );
      }
      if (args.filter?.titleContains) filter.titleContains = args.filter.titleContains;
      return listIssues({
        ctx: ctx.auth as FullAuthContext,
        filter,
        sort: args.sort ?? 'created_desc',
        limit: args.limit ?? undefined,
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  createIssue: t.field({
    type: 'Issue',
    args: {
      title: t.arg.string({ required: true }),
      description: t.arg.string(),
      priority: t.arg.int(),
      type: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.auth) throw new UnauthorizedError();
      return createIssue({
        ctx: ctx.auth as FullAuthContext,
        title: args.title,
        description: args.description ?? undefined,
        priority: args.priority ?? undefined,
        type: args.type ?? undefined,
      });
    },
  }),
}));
