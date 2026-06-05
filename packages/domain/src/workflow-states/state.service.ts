import { tenantPoolQuery } from '@xpntl/db';
import type { FullAuthContext, WorkflowStateRow } from '../types.js';

export async function listWorkflowStates(ctx: FullAuthContext): Promise<WorkflowStateRow[]> {
  const { rows } = await tenantPoolQuery<WorkflowStateRow>(
    ctx.workspace.id,
    `SELECT * FROM workflow_states WHERE {TENANT} ORDER BY position ASC`,
  );
  return rows;
}
