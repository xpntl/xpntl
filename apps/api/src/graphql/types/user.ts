import { builder } from '../builder.js';

builder.objectType('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    displayName: t.string({
      nullable: true,
      resolve: (u) => u.display_name,
    }),
    role: t.exposeString('role'),
    isSuperAdmin: t.boolean({
      resolve: (u) => u.is_super_admin,
    }),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (u) => u.created_at,
    }),
  }),
});

builder.queryFields((t) => ({
  me: t.field({
    type: 'User',
    nullable: true,
    description: 'The currently authenticated user, or null if not signed in.',
    resolve: (_root, _args, ctx) => ctx.auth?.user ?? null,
  }),
  myWorkspace: t.field({
    type: 'Workspace',
    nullable: true,
    description: 'The workspace of the currently authenticated user.',
    resolve: (_root, _args, ctx) => ctx.auth?.workspace ?? null,
  }),
}));
