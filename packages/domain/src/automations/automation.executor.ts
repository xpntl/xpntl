import { getPool, tenantPoolQuery } from '@xpntl/db';
import type { FullAuthContext, WorkflowStateRow } from '../types.js';
import type { AutomationRow } from './automation.service.js';

/**
 * Trigger events that automations can respond to.
 */
export type AutomationTrigger =
  | {
      type: 'state_change';
      issueId: string;
      issueKey: string;
      fromStateType: string;
      toStateType: string;
    }
  | {
      type: 'issue_created';
      issueId: string;
      issueKey: string;
      stateType: string;
    }
  | {
      type: 'label_added';
      issueId: string;
      issueKey: string;
      labelId: string;
    };

/**
 * Evaluate all enabled automations for a workspace against a trigger event.
 * Matching automations have their actions executed.
 *
 * This is fire-and-forget — errors in individual automations are logged but
 * do not propagate to the caller.
 */
export async function evaluateAutomations(
  ctx: FullAuthContext,
  trigger: AutomationTrigger,
): Promise<void> {
  let automations: AutomationRow[];
  try {
    const { rows } = await tenantPoolQuery<AutomationRow>(
      ctx.workspace.id,
      `SELECT * FROM workflow_automations
        WHERE {TENANT} AND enabled = true AND trigger_type = $1`,
      [trigger.type],
    );
    automations = rows;
  } catch {
    return; // table may not exist yet during migration rollout
  }

  for (const automation of automations) {
    try {
      if (matchesTrigger(automation, trigger)) {
        await executeAction(ctx, automation, trigger);
      }
    } catch (err) {
      console.error(
        `[automation] Failed to execute automation ${automation.id} (${automation.name}):`,
        err,
      );
    }
  }
}

function matchesTrigger(automation: AutomationRow, trigger: AutomationTrigger): boolean {
  const cfg = automation.trigger_config;

  switch (trigger.type) {
    case 'state_change': {
      const fromType = cfg.from_state_type as string | undefined;
      const toType = cfg.to_state_type as string | undefined;
      if (fromType && fromType !== trigger.fromStateType) return false;
      if (toType && toType !== trigger.toStateType) return false;
      return true;
    }
    case 'issue_created': {
      const stateType = cfg.state_type as string | undefined;
      if (stateType && stateType !== trigger.stateType) return false;
      return true;
    }
    case 'label_added': {
      const labelId = cfg.label_id as string | undefined;
      if (labelId && labelId !== trigger.labelId) return false;
      return true;
    }
    default:
      return false;
  }
}

async function executeAction(
  ctx: FullAuthContext,
  automation: AutomationRow,
  trigger: AutomationTrigger,
): Promise<void> {
  const cfg = automation.action_config;
  const issueId = trigger.issueId;

  switch (automation.action_type) {
    case 'set_label': {
      const labelId = cfg.label_id as string | undefined;
      if (!labelId) break;
      // Use raw SQL to avoid circular imports with label.service
      await getPool().query(
        `INSERT INTO issue_labels (workspace_id, issue_id, label_id, attached_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (issue_id, label_id) DO NOTHING`,
        [ctx.workspace.id, issueId, labelId, ctx.user.id],
      );
      break;
    }
    case 'set_assignee': {
      const assigneeId = cfg.assignee_id as string | undefined;
      if (!assigneeId) break;
      await tenantPoolQuery(
        ctx.workspace.id,
        `UPDATE issues SET assignee_id = $1, updated_at = now()
         WHERE {TENANT} AND id = $2`,
        [assigneeId, issueId],
      );
      break;
    }
    case 'set_priority': {
      const priority = cfg.priority as number | undefined;
      if (priority === undefined || priority === null) break;
      await tenantPoolQuery(
        ctx.workspace.id,
        `UPDATE issues SET priority = $1, updated_at = now()
         WHERE {TENANT} AND id = $2`,
        [priority, issueId],
      );
      break;
    }
    case 'add_comment': {
      const body = cfg.body as string | undefined;
      if (!body) break;
      const { newId } = await import('../id.js');
      await getPool().query(
        `INSERT INTO comments (id, workspace_id, issue_id, author_id, body)
         VALUES ($1, $2, $3, $4, $5)`,
        [newId(), ctx.workspace.id, issueId, ctx.user.id, body],
      );
      break;
    }
    case 'move_state': {
      const stateId = cfg.state_id as string | undefined;
      const stateType = cfg.state_type as string | undefined;
      let targetStateId = stateId;

      // If state_type is provided instead of state_id, resolve it
      if (!targetStateId && stateType) {
        const { rows } = await tenantPoolQuery<WorkflowStateRow>(
          ctx.workspace.id,
          'SELECT id FROM workflow_states WHERE {TENANT} AND type = $1 ORDER BY position ASC LIMIT 1',
          [stateType],
        );
        targetStateId = rows[0]?.id;
      }

      if (!targetStateId) break;
      await tenantPoolQuery(
        ctx.workspace.id,
        `UPDATE issues SET state_id = $1, updated_at = now()
         WHERE {TENANT} AND id = $2`,
        [targetStateId, issueId],
      );
      break;
    }
  }
}
