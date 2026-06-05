import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type ChecklistRow = {
  id: string;
  workspace_id: string;
  issue_id: string;
  title: string;
  position: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ChecklistItemRow = {
  id: string;
  checklist_id: string;
  content: string;
  checked: boolean;
  position: number;
  assignee_id: string | null;
  due_date: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ChecklistWithItems = ChecklistRow & { items: ChecklistItemRow[] };

export type ChecklistProgress = {
  checklistId: string;
  total: number;
  checked: number;
  progress: number;
};

export async function createChecklist(input: {
  ctx: FullAuthContext;
  issueId: string;
  title?: string;
}): Promise<ChecklistRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can create checklists');
  }

  const pool = getPool();
  const { rows } = await pool.query<ChecklistRow>(
    `INSERT INTO checklists (id, workspace_id, issue_id, title, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [newId(), input.ctx.workspace.id, input.issueId, input.title ?? 'Checklist', input.ctx.user.id],
  );
  return rows[0]!;
}

export async function updateChecklist(input: {
  ctx: FullAuthContext;
  checklistId: string;
  title?: string;
  position?: number;
}): Promise<ChecklistRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can update checklists');
  }

  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [input.checklistId];
  let idx = 2;

  if (input.title !== undefined) {
    sets.push(`title = $${idx++}`);
    params.push(input.title);
  }
  if (input.position !== undefined) {
    sets.push(`position = $${idx++}`);
    params.push(input.position);
  }

  const { rows } = await tenantPoolQuery<ChecklistRow>(
    input.ctx.workspace.id,
    `UPDATE checklists SET ${sets.join(', ')} WHERE {TENANT} AND id = $1 RETURNING *`,
    params,
  );
  if (!rows[0]) throw new NotFoundError('Checklist not found');
  return rows[0];
}

export async function deleteChecklist(input: {
  ctx: FullAuthContext;
  checklistId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can delete checklists');
  }

  const { rowCount } = await tenantPoolQuery(
    input.ctx.workspace.id,
    `DELETE FROM checklists WHERE {TENANT} AND id = $1`,
    [input.checklistId],
  );
  if (rowCount === 0) throw new NotFoundError('Checklist not found');
}

export async function addChecklistItem(input: {
  ctx: FullAuthContext;
  checklistId: string;
  content: string;
  assigneeId?: string;
  dueDate?: string;
}): Promise<ChecklistItemRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can add checklist items');
  }

  const pool = getPool();
  const { rows } = await pool.query<ChecklistItemRow>(
    `INSERT INTO checklist_items (id, checklist_id, content, assignee_id, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [newId(), input.checklistId, input.content, input.assigneeId ?? null, input.dueDate ?? null],
  );
  return rows[0]!;
}

export async function updateChecklistItem(input: {
  ctx: FullAuthContext;
  itemId: string;
  content?: string;
  checked?: boolean;
  position?: number;
  assigneeId?: string | null;
  dueDate?: string | null;
}): Promise<ChecklistItemRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can update checklist items');
  }

  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [input.itemId];
  let idx = 2;

  if (input.content !== undefined) {
    sets.push(`content = $${idx++}`);
    params.push(input.content);
  }
  if (input.checked !== undefined) {
    sets.push(`checked = $${idx++}`);
    params.push(input.checked);
  }
  if (input.position !== undefined) {
    sets.push(`position = $${idx++}`);
    params.push(input.position);
  }
  if (input.assigneeId !== undefined) {
    sets.push(`assignee_id = $${idx++}`);
    params.push(input.assigneeId);
  }
  if (input.dueDate !== undefined) {
    sets.push(`due_date = $${idx++}`);
    params.push(input.dueDate);
  }

  const pool = getPool();
  const { rows } = await pool.query<ChecklistItemRow>(
    `UPDATE checklist_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  );
  if (!rows[0]) throw new NotFoundError('Checklist item not found');
  return rows[0];
}

export async function deleteChecklistItem(input: {
  ctx: FullAuthContext;
  itemId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can delete checklist items');
  }

  const pool = getPool();
  const { rowCount } = await pool.query(`DELETE FROM checklist_items WHERE id = $1`, [
    input.itemId,
  ]);
  if (rowCount === 0) throw new NotFoundError('Checklist item not found');
}

export async function listChecklistsForIssue(
  ctx: FullAuthContext,
  issueId: string,
): Promise<ChecklistWithItems[]> {
  const { rows: checklists } = await tenantPoolQuery<ChecklistRow>(
    ctx.workspace.id,
    `SELECT * FROM checklists WHERE {TENANT} AND issue_id = $1 ORDER BY position ASC, created_at ASC`,
    [issueId],
  );
  if (checklists.length === 0) return [];

  const pool = getPool();
  const checklistIds = checklists.map((c) => c.id);
  const { rows: items } = await pool.query<ChecklistItemRow>(
    `SELECT * FROM checklist_items WHERE checklist_id = ANY($1::text[]) ORDER BY position ASC, created_at ASC`,
    [checklistIds],
  );

  const itemMap = new Map<string, ChecklistItemRow[]>();
  for (const item of items) {
    const list = itemMap.get(item.checklist_id) ?? [];
    list.push(item);
    itemMap.set(item.checklist_id, list);
  }

  return checklists.map((cl) => ({
    ...cl,
    items: itemMap.get(cl.id) ?? [],
  }));
}

export async function checklistProgressForIssues(
  ctx: FullAuthContext,
  issueIds: string[],
): Promise<Map<string, ChecklistProgress[]>> {
  if (issueIds.length === 0) return new Map();

  const { rows } = await tenantPoolQuery<{
    issue_id: string;
    checklist_id: string;
    total: string;
    checked: string;
  }>(
    ctx.workspace.id,
    `SELECT c.issue_id, c.id AS checklist_id,
            COUNT(ci.id)::int AS total,
            COUNT(ci.id) FILTER (WHERE ci.checked)::int AS checked
       FROM checklists c
       LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
      WHERE c.{TENANT} AND c.issue_id = ANY($1::text[])
      GROUP BY c.issue_id, c.id`,
    [issueIds],
  );

  const map = new Map<string, ChecklistProgress[]>();
  for (const r of rows) {
    const total = Number(r.total);
    const checked = Number(r.checked);
    const entry: ChecklistProgress = {
      checklistId: r.checklist_id,
      total,
      checked,
      progress: total > 0 ? checked / total : 0,
    };
    const list = map.get(r.issue_id) ?? [];
    list.push(entry);
    map.set(r.issue_id, list);
  }
  return map;
}
