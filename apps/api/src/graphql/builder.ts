import SchemaBuilder from '@pothos/core';
import type { AuthContext, CommentRow, IssueRow, UserRow, WorkspaceRow } from '@xpntl/domain';

export type GraphQLContext = {
  auth: AuthContext | null;
};

export type CommentWithMentions = CommentRow & { mentionedUserIds: string[] };

// Registering object types here lets resolvers reference them by string name
// (e.g. `t.field({ type: 'Workspace' })`) with full type inference. Without this
// the builder would only accept ref values, which would force every cross-type
// reference into an explicit import.
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  Objects: {
    Workspace: WorkspaceRow;
    User: UserRow;
    Issue: IssueRow;
    Comment: CommentWithMentions;
  };
  Scalars: {
    DateTime: { Input: Date; Output: Date };
  };
}>({});

builder.scalarType('DateTime', {
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value) => {
    if (typeof value !== 'string') throw new Error('DateTime must be a string');
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid DateTime');
    return d;
  },
});
