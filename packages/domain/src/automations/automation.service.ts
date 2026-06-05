import { getPool, tenantPoolQuery } from '@xpntl/db';
import { ValidationError } from '../errors.js';
import type { FullAuthContext } from '../types.js';

export type AutomationRow = {
  id: string;
  workspace_id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export type TriggerType = 'state_change' | 'issue_created' | 'label_added' | 'due_date_passed';
export type ActionType =
  | 'set_label'
  | 'set_assignee'
  | 'set_priority'
  | 'add_comment'
  | 'move_state';

const VALID_TRIGGER_TYPES: ReadonlySet<string> = new Set([
  'state_change',
  'issue_created',
  'label_added',
  'due_date_passed',
]);

const VALID_ACTION_TYPES: ReadonlySet<string> = new Set([
  'set_label',
  'set_assignee',
  'set_priority',
  'add_comment',
  'move_state',
]);

export type CreateAutomationInput = {
  name: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  actionType: string;
  actionConfig?: Record<string, unknown>;
  enabled?: boolean;
};

export type UpdateAutomationInput = {
  name?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  actionType?: string;
  actionConfig?: Record<string, unknown>;
  enabled?: boolean;
};

function validateTriggerType(t: string): void {
  if (!VALID_TRIGGER_TYPES.has(t)) {
    throw new ValidationError(`Invalid trigger type: ${t}`);
  }
}

function validateActionType(a: string): void {
  if (!VALID_ACTION_TYPES.has(a)) {
    throw new ValidationError(`Invalid action type: ${a}`);
  }
}

export async function createAutomation(
  ctx: FullAuthContext,
  input: CreateAutomationInput,
): Promise<AutomationRow> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    throw new ValidationError('name must be 1-200 characters');
  }
  validateTriggerType(input.triggerType);
  validateActionType(input.actionType);

  const { rows } = await tenantPoolQuery<AutomationRow>(
    ctx.workspace.id,
    `INSERT INTO workflow_automations
       (workspace_id, name, enabled, trigger_type, trigger_config, action_type, action_config, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      ctx.workspace.id,
      name,
      input.enabled ?? true,
      input.triggerType,
      JSON.stringify(input.triggerConfig ?? {}),
      input.actionType,
      JSON.stringify(input.actionConfig ?? {}),
      ctx.user.id,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('Failed to create automation');
  return row;
}

export async function listAutomations(ctx: FullAuthContext): Promise<AutomationRow[]> {
  const { rows } = await tenantPoolQuery<AutomationRow>(
    ctx.workspace.id,
    'SELECT * FROM workflow_automations WHERE {TENANT} ORDER BY created_at DESC',
  );
  return rows;
}

export async function updateAutomation(
  ctx: FullAuthContext,
  id: string,
  input: UpdateAutomationInput,
): Promise<AutomationRow> {
  if (input.triggerType !== undefined) validateTriggerType(input.triggerType);
  if (input.actionType !== undefined) validateActionType(input.actionType);
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 200) {
      throw new ValidationError('name must be 1-200 characters');
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    params.push(input.name.trim());
    sets.push(`name = $${params.length}`);
  }
  if (input.enabled !== undefined) {
    params.push(input.enabled);
    sets.push(`enabled = $${params.length}`);
  }
  if (input.triggerType !== undefined) {
    params.push(input.triggerType);
    sets.push(`trigger_type = $${params.length}`);
  }
  if (input.triggerConfig !== undefined) {
    params.push(JSON.stringify(input.triggerConfig));
    sets.push(`trigger_config = $${params.length}`);
  }
  if (input.actionType !== undefined) {
    params.push(input.actionType);
    sets.push(`action_type = $${params.length}`);
  }
  if (input.actionConfig !== undefined) {
    params.push(JSON.stringify(input.actionConfig));
    sets.push(`action_config = $${params.length}`);
  }

  if (sets.length === 0) {
    throw new ValidationError('patch must include at least one field');
  }

  sets.push('updated_at = now()');
  params.push(ctx.workspace.id);
  params.push(id);

  const { rows } = await getPool().query<AutomationRow>(
    `UPDATE workflow_automations
        SET ${sets.join(', ')}
      WHERE workspace_id = $${params.length - 1}
        AND id = $${params.length}
      RETURNING *`,
    params,
  );
  const row = rows[0];
  if (!row) throw new ValidationError('Automation not found');
  return row;
}

export async function deleteAutomation(ctx: FullAuthContext, id: string): Promise<void> {
  const { rows } = await tenantPoolQuery<{ id: string }>(
    ctx.workspace.id,
    'DELETE FROM workflow_automations WHERE {TENANT} AND id = $1 RETURNING id',
    [id],
  );
  if (rows.length === 0) {
    throw new ValidationError('Automation not found');
  }
}
