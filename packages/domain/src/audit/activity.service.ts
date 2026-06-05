import { tenantPoolQuery } from '@xpntl/db';
import type { FullAuthContext } from '../types.js';

export type ActivityEntry = {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  actor_display_name: string | null;
  actor_email: string | null;
};

export async function listActivityForIssue(
  ctx: FullAuthContext,
  issueId: string,
  opts?: { limit?: number },
): Promise<ActivityEntry[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const { rows } = await tenantPoolQuery<ActivityEntry>(
    ctx.workspace.id,
    `SELECT a.id, a.workspace_id, a.actor_user_id, a.event_type,
            a.target_type, a.target_id, a.metadata, a.created_at,
            u.display_name AS actor_display_name, u.email AS actor_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.{TENANT} AND a.target_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [issueId, limit],
  );
  return rows;
}
