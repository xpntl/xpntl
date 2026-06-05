import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery } from '@xpntl/db';
import { ForbiddenError } from '../errors.js';
import type { FullAuthContext } from '../types.js';

function assertAdmin(ctx: FullAuthContext): void {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Admin access required for data export');
  }
}

export type WorkspaceExport = {
  exportedAt: string;
  workspaceId: string;
  issues: unknown[];
  comments: unknown[];
  labels: unknown[];
  attachments: unknown[];
  projects: unknown[];
  workflow_states: unknown[];
  users: unknown[];
  teams: unknown[];
  milestones: unknown[];
  initiatives: unknown[];
  custom_fields: unknown[];
  tags: unknown[];
  automations: unknown[];
};

/**
 * Export all workspace data as a structured JSON object.
 * Restricted to workspace Admins (and above).
 */
export async function exportWorkspaceData(
  ctx: FullAuthContext,
  workspaceId: string,
): Promise<WorkspaceExport> {
  assertAdmin(ctx);

  const [
    issues,
    comments,
    labels,
    attachments,
    projects,
    workflowStates,
    users,
    teams,
    milestones,
    initiatives,
    customFields,
    tags,
    automations,
  ] = await Promise.all([
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM issues WHERE {TENANT} AND deleted_at IS NULL ORDER BY created_at`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM comments WHERE {TENANT} ORDER BY created_at`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM labels WHERE {TENANT} ORDER BY name`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM attachments WHERE {TENANT} ORDER BY created_at`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM projects WHERE {TENANT} ORDER BY created_at`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM workflow_states WHERE {TENANT} ORDER BY position`,
    ),
    getPool().query(
      `SELECT id, email, display_name, role, is_agent, avatar_url, created_at, updated_at
       FROM users WHERE workspace_id = $1 ORDER BY created_at`,
      [workspaceId],
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM teams WHERE {TENANT} ORDER BY name`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM milestones WHERE {TENANT} ORDER BY sort_order`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM initiatives WHERE {TENANT} ORDER BY sort_order`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM custom_fields WHERE {TENANT} ORDER BY position`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM tags WHERE {TENANT} ORDER BY name`,
    ),
    tenantPoolQuery(
      workspaceId,
      `SELECT * FROM automations WHERE {TENANT} ORDER BY created_at`,
    ),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    workspaceId,
    issues: issues.rows,
    comments: comments.rows,
    labels: labels.rows,
    attachments: attachments.rows,
    projects: projects.rows,
    workflow_states: workflowStates.rows,
    users: users.rows,
    teams: teams.rows,
    milestones: milestones.rows,
    initiatives: initiatives.rows,
    custom_fields: customFields.rows,
    tags: tags.rows,
    automations: automations.rows,
  };
}
