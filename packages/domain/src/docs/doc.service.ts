import { isAtLeast } from '@xpntl/auth';
import { tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { canCreateIssue } from '../authz.js';
import type { FullAuthContext } from '../types.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type DocRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  parent_id: string | null;
  position: number;
  title: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type DocRevisionRow = {
  id: string;
  doc_id: string;
  content: string;
  edited_by: string | null;
  created_at: Date;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listDocs(
  ctx: FullAuthContext,
  opts?: { projectId?: string },
): Promise<DocRow[]> {
  if (opts?.projectId) {
    const { rows } = await tenantPoolQuery<DocRow>(
      ctx.workspace.id,
      `SELECT * FROM docs WHERE {TENANT} AND project_id = $1 ORDER BY updated_at DESC`,
      [opts.projectId],
    );
    return rows;
  }
  const { rows } = await tenantPoolQuery<DocRow>(
    ctx.workspace.id,
    `SELECT * FROM docs WHERE {TENANT} ORDER BY updated_at DESC`,
    [],
  );
  return rows;
}

export async function getDoc(ctx: FullAuthContext, docId: string): Promise<DocRow> {
  const { rows } = await tenantPoolQuery<DocRow>(
    ctx.workspace.id,
    `SELECT * FROM docs WHERE {TENANT} AND id = $1`,
    [docId],
  );
  const doc = rows[0];
  if (!doc) throw new NotFoundError('Doc not found');
  return doc;
}

export async function createDoc(
  ctx: FullAuthContext,
  input: { title: string; content?: string; projectId?: string; parentId?: string | null },
): Promise<DocRow> {
  if (!canCreateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to create docs');
  }

  const title = input.title.trim();
  if (title.length < 1 || title.length > 500) {
    throw new ValidationError('Title must be 1-500 characters');
  }

  const content = input.content ?? '';
  const id = newId();
  const revisionId = newId();

  return withTransaction(async (client) => {
    const { rows } = await client.query<DocRow>(
      `INSERT INTO docs (id, workspace_id, project_id, parent_id, title, content, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [id, ctx.workspace.id, input.projectId ?? null, input.parentId ?? null, title, content, ctx.user.id],
    );
    const doc = rows[0]!;

    // Save initial revision
    await client.query(
      `INSERT INTO doc_revisions (id, doc_id, content, edited_by)
       VALUES ($1, $2, $3, $4)`,
      [revisionId, doc.id, content, ctx.user.id],
    );

    return doc;
  });
}

export async function updateDoc(
  ctx: FullAuthContext,
  docId: string,
  input: { title?: string; content?: string; parentId?: string | null },
): Promise<DocRow> {
  if (!canCreateIssue(ctx)) {
    throw new ForbiddenError('You do not have permission to edit docs');
  }

  const existing = await getDoc(ctx, docId);

  // Guard against a doc becoming its own ancestor (would orphan the subtree).
  if (input.parentId) {
    if (input.parentId === docId) {
      throw new ValidationError('A doc cannot be its own parent');
    }
    let cursor: string | null = input.parentId;
    const seen = new Set<string>([docId]);
    while (cursor) {
      if (seen.has(cursor)) {
        throw new ValidationError('Cannot move a doc beneath one of its own descendants');
      }
      seen.add(cursor);
      const parent: DocRow = await getDoc(ctx, cursor);
      cursor = parent.parent_id;
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [docId];
  let idx = 2;

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length < 1 || title.length > 500) {
      throw new ValidationError('Title must be 1-500 characters');
    }
    sets.push(`title = $${idx++}`);
    params.push(title);
  }
  if (input.content !== undefined) {
    sets.push(`content = $${idx++}`);
    params.push(input.content);
  }
  if (input.parentId !== undefined) {
    sets.push(`parent_id = $${idx++}`);
    params.push(input.parentId);
  }

  sets.push(`updated_by = $${idx++}`);
  params.push(ctx.user.id);
  sets.push('updated_at = now()');

  return withTransaction(async (client) => {
    // Save previous content as a revision before overwriting
    if (input.content !== undefined && input.content !== existing.content) {
      await client.query(
        `INSERT INTO doc_revisions (id, doc_id, content, edited_by)
         VALUES ($1, $2, $3, $4)`,
        [newId(), docId, existing.content, ctx.user.id],
      );
    }

    const { rows } = await client.query<DocRow>(
      `UPDATE docs SET ${sets.join(', ')} WHERE workspace_id = $${idx} AND id = $1 RETURNING *`,
      [...params, ctx.workspace.id],
    );
    const doc = rows[0];
    if (!doc) throw new NotFoundError('Doc not found');
    return doc;
  });
}

export async function deleteDoc(ctx: FullAuthContext, docId: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete docs');
  }

  // Fetch first so we know the parent to re-home children under (tenant-scoped).
  const existing = await getDoc(ctx, docId);

  await withTransaction(async (client) => {
    // XP-89: move sub-pages up to the deleted doc's parent rather than orphaning
    // them to the root (the FK's ON DELETE SET NULL is just a safety net).
    await client.query(
      `UPDATE docs SET parent_id = $1, updated_at = now()
       WHERE workspace_id = $2 AND parent_id = $3`,
      [existing.parent_id, ctx.workspace.id, docId],
    );
    const { rowCount } = await client.query(
      `DELETE FROM docs WHERE workspace_id = $1 AND id = $2`,
      [ctx.workspace.id, docId],
    );
    if (rowCount === 0) throw new NotFoundError('Doc not found');
  });
}

export async function listRevisions(
  ctx: FullAuthContext,
  docId: string,
): Promise<DocRevisionRow[]> {
  // Verify doc belongs to workspace
  await getDoc(ctx, docId);

  const { rows } = await tenantPoolQuery<DocRevisionRow>(
    ctx.workspace.id,
    `SELECT r.* FROM doc_revisions r
       JOIN docs d ON d.id = r.doc_id
      WHERE d.workspace_id = $1 AND r.doc_id = $2
      ORDER BY r.created_at DESC`,
    [ctx.workspace.id, docId],
  );
  return rows;
}
