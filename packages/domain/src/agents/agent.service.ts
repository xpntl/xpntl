import { getPool, tenantPoolQuery, withTransaction } from '@xpntl/db';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, UserRow } from '../types.js';

export type AgentHarness = 'claude_code' | 'codex' | 'cursor' | 'opencode' | 'custom';

const VALID_HARNESSES: AgentHarness[] = ['claude_code', 'codex', 'cursor', 'opencode', 'custom'];

export type CreateAgentInput = {
  displayName: string;
  harness: AgentHarness;
  email?: string;
  avatarUrl?: string;
};

export async function createAgentUser(
  ctx: { workspace: { id: string }; account: { id: string } },
  input: CreateAgentInput,
): Promise<UserRow> {
  if (!VALID_HARNESSES.includes(input.harness)) {
    throw new ValidationError(`Invalid harness: ${input.harness}`);
  }

  const pool = getPool();
  const accountId = newId();
  const slug = input.displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const email = input.email ?? `${slug}+${accountId.slice(0, 8)}@agent.xpntl.local`;
  const { rows: acctRows } = await pool.query(
    `INSERT INTO accounts (id, email, display_name) VALUES ($1, $2, $3) RETURNING id`,
    [accountId, email, input.displayName],
  );
  const agentAccountId = (acctRows[0] as { id: string }).id;

  const id = newId();
  const cols = ['id', 'workspace_id', 'account_id', 'email', 'display_name', 'role', 'is_agent', 'agent_harness'];
  const vals = [id, ctx.workspace.id, agentAccountId, email, input.displayName, 'Member', true, input.harness];
  if (input.avatarUrl) {
    cols.push('avatar_url');
    vals.push(input.avatarUrl);
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  return rows[0]!;
}

export async function listAgentUsers(
  ctx: { workspace: { id: string } },
): Promise<UserRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE workspace_id = $1 AND is_agent = true ORDER BY display_name`,
    [ctx.workspace.id],
  );
  return rows;
}

export async function getAgentUser(
  ctx: { workspace: { id: string } },
  agentId: string,
): Promise<UserRow> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE workspace_id = $1 AND id = $2 AND is_agent = true`,
    [ctx.workspace.id, agentId],
  );
  if (!rows[0]) throw new NotFoundError('Agent not found');
  return rows[0];
}

export async function deleteAgentUser(
  ctx: { workspace: { id: string }; user: { id: string } },
  agentId: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ account_id: string }>(
      `SELECT account_id FROM users WHERE workspace_id = $1 AND id = $2 AND is_agent = true FOR UPDATE`,
      [ctx.workspace.id, agentId],
    );
    if (!rows[0]) throw new NotFoundError('Agent not found');

    // issues.creator_id and comments.author_id are NOT NULL + ON DELETE RESTRICT,
    // so a member who created issues or posted comments can't be hard-deleted
    // until those are reattributed. Hand them to the actor doing the removal so
    // the issues/comments survive; everything else FK-cascades or sets null.
    await client.query(
      'UPDATE issues SET creator_id = $1 WHERE creator_id = $2 AND workspace_id = $3',
      [ctx.user.id, agentId, ctx.workspace.id],
    );
    await client.query('UPDATE comments SET author_id = $1 WHERE author_id = $2', [ctx.user.id, agentId]);

    await client.query('DELETE FROM users WHERE id = $1', [agentId]);
    await client.query('DELETE FROM accounts WHERE id = $1', [rows[0].account_id]);
  });
}

export async function updateAgentUser(
  ctx: { workspace: { id: string } },
  agentId: string,
  input: { displayName?: string; harness?: AgentHarness; avatarUrl?: string | null },
): Promise<UserRow> {
  const agent = await getAgentUser(ctx, agentId);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.displayName !== undefined) {
    params.push(input.displayName.trim());
    sets.push(`display_name = $${params.length}`);
  }
  if (input.harness !== undefined) {
    if (!VALID_HARNESSES.includes(input.harness)) {
      throw new ValidationError(`Invalid harness: ${input.harness}`);
    }
    params.push(input.harness);
    sets.push(`agent_harness = $${params.length}`);
  }
  if (input.avatarUrl !== undefined) {
    params.push(input.avatarUrl?.trim() || null);
    sets.push(`avatar_url = $${params.length}`);
  }
  if (sets.length === 0) return agent;
  sets.push('updated_at = now()');
  params.push(agent.id);
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0]!;
}

export type AgentActivityEntry = {
  id: string;
  actor_user_id: string;
  display_name: string | null;
  agent_harness: string | null;
  avatar_url: string | null;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export async function listAgentActivity(
  ctx: FullAuthContext,
  opts: { agentId?: string; limit?: number; cursor?: string } = {},
): Promise<AgentActivityEntry[]> {
  const conditions: string[] = ['{TENANT}'];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.agentId) {
    conditions.push(`al.actor_user_id = $${idx++}`);
    params.push(opts.agentId);
  }

  if (opts.cursor) {
    conditions.push(`al.created_at < $${idx++}`);
    params.push(new Date(opts.cursor));
  }

  const limit = Math.min(opts.limit ?? 50, 200);

  const sql = `
    SELECT al.id, al.actor_user_id, u.display_name, u.agent_harness, u.avatar_url,
           al.event_type, al.target_type, al.target_id, al.metadata, al.created_at
    FROM audit_log al
    JOIN users u ON u.id = al.actor_user_id AND u.is_agent = true
    WHERE ${conditions.join(' AND ')}
    ORDER BY al.created_at DESC
    LIMIT ${limit}
  `;

  const { rows } = await tenantPoolQuery<AgentActivityEntry>(ctx.workspace.id, sql, params);
  return rows;
}

export async function linkHarnessKeyToAgent(
  ctx: { workspace: { id: string } },
  harnessKeyId: string,
  agentUserId: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE coding_harness_keys
        SET agent_user_id = $1
      WHERE id = $2 AND workspace_id = $3 AND revoked_at IS NULL`,
    [agentUserId, harnessKeyId, ctx.workspace.id],
  );
}
