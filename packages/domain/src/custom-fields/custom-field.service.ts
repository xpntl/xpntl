import { isAtLeast } from '@xpntl/auth';
import { tenantClientQuery, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, CustomFieldRow } from '../types.js';

export type CreateCustomFieldInput = {
  ctx: FullAuthContext;
  slug: string;
  label: string;
  type: 'dropdown' | 'number' | 'url' | 'date';
  config?: Record<string, unknown>;
  required?: boolean;
};

export async function createCustomField(input: CreateCustomFieldInput): Promise<CustomFieldRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can create custom fields');
  }

  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (slug.length < 1 || slug.length > 64) {
    throw new ValidationError('slug must be 1-64 lowercase alphanumeric/underscore characters');
  }

  const label = input.label.trim();
  if (label.length < 1 || label.length > 100) {
    throw new ValidationError('label must be 1-100 characters');
  }

  return withTransaction(async (client) => {
    const existing = await tenantClientQuery<CustomFieldRow>(
      client,
      input.ctx.workspace.id,
      `SELECT id FROM custom_fields WHERE {TENANT} AND lower(slug) = $1`,
      [slug],
    );
    if (existing.rows.length > 0) {
      throw new ValidationError(`Custom field slug "${slug}" already exists`);
    }

    const maxPos = await tenantClientQuery<{ max_pos: number | null }>(
      client,
      input.ctx.workspace.id,
      `SELECT MAX(position) as max_pos FROM custom_fields WHERE {TENANT}`,
    );

    const id = newId();
    const result = await client.query<CustomFieldRow>(
      `INSERT INTO custom_fields (id, workspace_id, slug, label, type, config, position, required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        input.ctx.workspace.id,
        slug,
        label,
        input.type,
        JSON.stringify(input.config ?? {}),
        (maxPos.rows[0]?.max_pos ?? -1) + 1,
        input.required ?? false,
      ],
    );
    return result.rows[0]!;
  });
}

export async function listCustomFields(ctx: FullAuthContext): Promise<CustomFieldRow[]> {
  const { rows } = await tenantPoolQuery<CustomFieldRow>(
    ctx.workspace.id,
    `SELECT * FROM custom_fields WHERE {TENANT} ORDER BY position ASC`,
  );
  return rows;
}

export async function getCustomFieldById(ctx: FullAuthContext, id: string): Promise<CustomFieldRow> {
  const { rows } = await tenantPoolQuery<CustomFieldRow>(
    ctx.workspace.id,
    `SELECT * FROM custom_fields WHERE {TENANT} AND id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Custom field not found');
  return rows[0];
}

export type UpdateCustomFieldInput = {
  ctx: FullAuthContext;
  id: string;
  label?: string;
  config?: Record<string, unknown>;
  required?: boolean;
};

export async function updateCustomField(input: UpdateCustomFieldInput): Promise<CustomFieldRow> {
  if (!isAtLeast(input.ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can update custom fields');
  }

  return withTransaction(async (client) => {
    const current = await tenantClientQuery<CustomFieldRow>(
      client,
      input.ctx.workspace.id,
      `SELECT * FROM custom_fields WHERE {TENANT} AND id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new NotFoundError('Custom field not found');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.label !== undefined) {
      const label = input.label.trim();
      if (label.length < 1 || label.length > 100)
        throw new ValidationError('label must be 1-100 characters');
      params.push(label);
      sets.push(`label = $${params.length}`);
    }
    if (input.config !== undefined) {
      params.push(JSON.stringify(input.config));
      sets.push(`config = $${params.length}`);
    }
    if (input.required !== undefined) {
      params.push(input.required);
      sets.push(`required = $${params.length}`);
    }

    if (sets.length === 0) return current.rows[0];

    sets.push('updated_at = now()');
    params.push(input.ctx.workspace.id);
    params.push(input.id);

    const result = await client.query<CustomFieldRow>(
      `UPDATE custom_fields SET ${sets.join(', ')} WHERE workspace_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function deleteCustomField(ctx: FullAuthContext, id: string): Promise<void> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins can delete custom fields');
  }
  await tenantPoolQuery(ctx.workspace.id, `DELETE FROM custom_fields WHERE {TENANT} AND id = $1`, [
    id,
  ]);
}
