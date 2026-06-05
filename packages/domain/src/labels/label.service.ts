import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { recordOnClient } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import { logActivityOnClient } from '../issues/issue-activity.service.js';
import type { FullAuthContext } from '../types.js';

export type LabelRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: Date;
};

export type IssueLabelRow = {
  workspace_id: string;
  issue_id: string;
  label_id: string;
  attached_at: Date;
  attached_by: string | null;
};

/**
 * List every label in the workspace. Sorted alphabetically.
 */
export async function listLabels(ctx: FullAuthContext): Promise<LabelRow[]> {
  const { rows } = await tenantPoolQuery<LabelRow>(
    ctx.workspace.id,
    `SELECT * FROM labels WHERE {TENANT} ORDER BY name ASC`,
  );
  return rows;
}

/**
 * Create a workspace-scoped label. Admins and Owners only (workspace policy).
 * For ad-hoc member-creatable tags, see PER-117 (separate primitive).
 */
export async function createLabel(input: {
  ctx: FullAuthContext;
  name: string;
  color?: string;
  description?: string | null;
}): Promise<LabelRow> {
  const { ctx } = input;
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can create labels');
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) {
    throw new ValidationError('Label name must be 1–60 characters');
  }
  const color = (input.color ?? '#4EA7FC').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new ValidationError('Label color must be a 6-digit hex string like #4EA7FC');
  }

  return withTransaction(async (client) => {
    // Case-insensitive duplicate check inside the tx for safety.
    const dup = await tenantClientQuery<{ id: string }>(
      client,
      ctx.workspace.id,
      `SELECT id FROM labels WHERE {TENANT} AND lower(name) = lower($1)`,
      [name],
    );
    if (dup.rows.length > 0) {
      throw new ValidationError(`Label "${name}" already exists`);
    }

    const id = newId();
    const result = await client.query<LabelRow>(
      `INSERT INTO labels (id, workspace_id, name, color, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, ctx.workspace.id, name, color, input.description?.trim() || null],
    );
    const label = result.rows[0];
    if (!label) throw new Error('Failed to insert label');

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'label.created',
      targetType: 'label',
      targetId: label.id,
      metadata: { name: label.name, color: label.color },
    });

    return label;
  });
}

/**
 * Update a label's name, color, or description. Admins and Owners only.
 */
export async function updateLabel(input: {
  ctx: FullAuthContext;
  labelId: string;
  name?: string;
  color?: string;
  description?: string | null;
}): Promise<LabelRow> {
  const { ctx, labelId } = input;
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can update labels');
  }

  return withTransaction(async (client) => {
    const existing = await tenantClientQuery<LabelRow>(
      client,
      ctx.workspace.id,
      `SELECT * FROM labels WHERE {TENANT} AND id = $1`,
      [labelId],
    );
    if (existing.rows.length === 0) throw new NotFoundError('Label not found');

    const label = existing.rows[0]!;
    const name = input.name !== undefined ? input.name.trim() : label.name;
    const color = input.color !== undefined ? input.color.trim() : label.color;
    const description =
      input.description !== undefined
        ? input.description?.trim() || null
        : label.description;

    if (name.length < 1 || name.length > 60) {
      throw new ValidationError('Label name must be 1–60 characters');
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new ValidationError('Label color must be a 6-digit hex string like #4EA7FC');
    }

    // Case-insensitive duplicate check (excluding self).
    if (name.toLowerCase() !== label.name.toLowerCase()) {
      const dup = await tenantClientQuery<{ id: string }>(
        client,
        ctx.workspace.id,
        `SELECT id FROM labels WHERE {TENANT} AND lower(name) = lower($1) AND id != $2`,
        [name, labelId],
      );
      if (dup.rows.length > 0) {
        throw new ValidationError(`Label "${name}" already exists`);
      }
    }

    const result = await client.query<LabelRow>(
      `UPDATE labels SET name = $1, color = $2, description = $3 WHERE id = $4 AND workspace_id = $5 RETURNING *`,
      [name, color, description, labelId, ctx.workspace.id],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('Failed to update label');

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'label.updated',
      targetType: 'label',
      targetId: labelId,
      metadata: { name: updated.name, color: updated.color },
    });

    return updated;
  });
}

/**
 * Delete a label. Removes all issue_labels associations too (ON DELETE CASCADE
 * or explicit). Admins and Owners only.
 */
export async function deleteLabel(input: {
  ctx: FullAuthContext;
  labelId: string;
}): Promise<void> {
  const { ctx, labelId } = input;
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete labels');
  }

  await withTransaction(async (client) => {
    // Remove issue_labels associations first.
    await client.query(
      `DELETE FROM issue_labels WHERE workspace_id = $1 AND label_id = $2`,
      [ctx.workspace.id, labelId],
    );

    const result = await client.query<{ id: string }>(
      `DELETE FROM labels WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [labelId, ctx.workspace.id],
    );
    if (result.rows.length === 0) throw new NotFoundError('Label not found');

    await recordOnClient(client, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.user.id,
      eventType: 'label.deleted',
      targetType: 'label',
      targetId: labelId,
      metadata: {},
    });
  });
}

/**
 * Attach a label to an issue. Idempotent — re-attaching is a no-op.
 */
export async function attachLabelToIssue(input: {
  ctx: FullAuthContext;
  issueId: string;
  labelId: string;
}): Promise<void> {
  const { ctx, issueId, labelId } = input;
  if (!isAtLeast(ctx.user.role, 'Member')) {
    throw new ForbiddenError('Only members can label issues');
  }

  await withTransaction(async (client) => {
    // Confirm both ends belong to this workspace.
    const issue = await tenantClientQuery<{ id: string }>(
      client,
      ctx.workspace.id,
      `SELECT id FROM issues WHERE {TENANT} AND id = $1`,
      [issueId],
    );
    if (issue.rows.length === 0) throw new NotFoundError('Issue not found');

    const label = await tenantClientQuery<{ id: string; name: string }>(
      client,
      ctx.workspace.id,
      `SELECT id, name FROM labels WHERE {TENANT} AND id = $1`,
      [labelId],
    );
    if (label.rows.length === 0) throw new NotFoundError('Label not found');

    const result = await client.query<IssueLabelRow>(
      `INSERT INTO issue_labels (workspace_id, issue_id, label_id, attached_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (issue_id, label_id) DO NOTHING
       RETURNING *`,
      [ctx.workspace.id, issueId, labelId, ctx.user.id],
    );

    if (result.rows.length > 0) {
      await recordOnClient(client, {
        workspaceId: ctx.workspace.id,
        actorUserId: ctx.user.id,
        eventType: 'issue.label_added',
        targetType: 'issue',
        targetId: issueId,
        metadata: { labelId, labelName: label.rows[0]?.name },
      });

      await logActivityOnClient(client, {
        issueId,
        workspaceId: ctx.workspace.id,
        actorId: ctx.user.id,
        action: 'label_change',
        newValue: { labelId, labelName: label.rows[0]?.name, op: 'added' },
      });
    }
  });
}

/**
 * Detach a label from an issue. Idempotent — detaching a label that isn't
 * attached is a no-op.
 */
export async function detachLabelFromIssue(input: {
  ctx: FullAuthContext;
  issueId: string;
  labelId: string;
}): Promise<void> {
  const { ctx, issueId, labelId } = input;
  if (!isAtLeast(ctx.user.role, 'Member')) {
    throw new ForbiddenError('Only members can label issues');
  }

  await withTransaction(async (client) => {
    const result = await client.query<{ label_id: string }>(
      `DELETE FROM issue_labels
        WHERE workspace_id = $1 AND issue_id = $2 AND label_id = $3
        RETURNING label_id`,
      [ctx.workspace.id, issueId, labelId],
    );
    if (result.rows.length > 0) {
      await recordOnClient(client, {
        workspaceId: ctx.workspace.id,
        actorUserId: ctx.user.id,
        eventType: 'issue.label_removed',
        targetType: 'issue',
        targetId: issueId,
        metadata: { labelId },
      });

      await logActivityOnClient(client, {
        issueId,
        workspaceId: ctx.workspace.id,
        actorId: ctx.user.id,
        action: 'label_change',
        oldValue: { labelId, op: 'removed' },
      });
    }
  });
}

/**
 * Look up the labels currently attached to a set of issues. Returns a map of
 * issueId → LabelRow[]. Used by serializers to embed labels in issue JSON.
 */
export async function labelsForIssues(
  ctx: FullAuthContext,
  issueIds: string[],
): Promise<Map<string, LabelRow[]>> {
  if (issueIds.length === 0) return new Map();

  // {TENANT} expands to `workspace_id = $N` and the wrapper appends the
  // workspace id to the params array — DON'T pass it again.
  const { rows } = await tenantPoolQuery<{ issue_id: string } & LabelRow>(
    ctx.workspace.id,
    `SELECT il.issue_id, l.*
       FROM issue_labels il
       JOIN labels l ON l.id = il.label_id
      WHERE il.{TENANT}
        AND il.issue_id = ANY($1::text[])
      ORDER BY l.name ASC`,
    [issueIds],
  );

  const map = new Map<string, LabelRow[]>();
  for (const r of rows) {
    const list = map.get(r.issue_id) ?? [];
    list.push({
      id: r.id,
      workspace_id: r.workspace_id,
      name: r.name,
      color: r.color,
      description: r.description,
      created_at: r.created_at,
    });
    map.set(r.issue_id, list);
  }
  return map;
}
