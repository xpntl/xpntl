import type { FullAuthContext, UserRow } from '@xpntl/domain';
import { UnauthorizedError, listWorkspaceUsers } from '@xpntl/domain';
import { builder } from '../builder.js';

const WorkspaceUserConnection = builder.objectRef<{
  users: UserRow[];
  nextCursor: string | null;
}>('WorkspaceUserConnection');

WorkspaceUserConnection.implement({
  fields: (t) => ({
    users: t.field({ type: ['User'], resolve: (page) => page.users }),
    nextCursor: t.string({ nullable: true, resolve: (page) => page.nextCursor }),
  }),
});

builder.objectType('Workspace', {
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    key: t.exposeString('key'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (w) => w.created_at,
    }),
    users: t.field({
      type: WorkspaceUserConnection,
      args: {
        limit: t.arg.int(),
        cursor: t.arg.string(),
      },
      resolve: async (_workspace, args, ctx) => {
        if (!ctx.auth) throw new UnauthorizedError();
        return listWorkspaceUsers(ctx.auth as FullAuthContext, {
          limit: args.limit ?? undefined,
          cursor: args.cursor ?? undefined,
        });
      },
    }),
  }),
});
