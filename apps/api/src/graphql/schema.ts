import { builder } from './builder.js';

// Root types must be initialized before the type modules register fields on them.
builder.queryType({
  fields: (t) => ({
    healthcheck: t.string({
      description: 'Returns "ok" if the GraphQL server is alive.',
      resolve: () => 'ok',
    }),
    serverTime: t.field({
      type: 'DateTime',
      description: 'Server clock. Useful for cache invalidation experiments.',
      resolve: () => new Date(),
    }),
  }),
});

builder.mutationType({});

// Side-effect imports: each type module registers fields on the builder above.
await import('./types/workspace.js');
await import('./types/user.js');
await import('./types/issue.js');
await import('./types/comment.js');

export const schema = builder.toSchema();
