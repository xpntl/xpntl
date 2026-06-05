import { tenantPoolQuery } from '@xpntl/db';
import { record } from '../audit/audit.service.js';
import { ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext, ReactionRow, ReactionSummary } from '../types.js';

export type ReactionTarget = 'issue' | 'comment';

const ALLOWED_EMOJI = ['👍', '👎', '❤️', '🎉', '🚀', '👀', '🙏', '😄'] as const;

export type AllowedEmoji = (typeof ALLOWED_EMOJI)[number];

export function isAllowedEmoji(value: string): value is AllowedEmoji {
  return (ALLOWED_EMOJI as readonly string[]).includes(value);
}

export const ALLOWED_REACTION_EMOJIS = ALLOWED_EMOJI;

export type ReactInput = {
  ctx: FullAuthContext;
  targetType: ReactionTarget;
  targetId: string;
  emoji: string;
};

/** Toggle a reaction: one reaction per user per target. Same emoji removes it, different emoji replaces it. */
export async function toggleReaction(input: ReactInput): Promise<{ added: boolean }> {
  if (!isAllowedEmoji(input.emoji)) {
    throw new ValidationError(`Emoji must be one of: ${ALLOWED_EMOJI.join(' ')}`);
  }

  const existing = await tenantPoolQuery<{ id: string; emoji: string }>(
    input.ctx.workspace.id,
    `SELECT id, emoji FROM reactions
       WHERE {TENANT}
         AND target_type = $1
         AND target_id = $2
         AND user_id = $3`,
    [input.targetType, input.targetId, input.ctx.user.id],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    await tenantPoolQuery(
      input.ctx.workspace.id,
      `DELETE FROM reactions WHERE {TENANT} AND id = $1`,
      [row.id],
    );
    if (row.emoji === input.emoji) {
      await record({
        workspaceId: input.ctx.workspace.id,
        actorUserId: input.ctx.user.id,
        eventType: 'reaction.removed',
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: { emoji: input.emoji },
      });
      return { added: false };
    }
  }

  // $6 = workspaceId auto-appended by tenantPoolQuery
  await tenantPoolQuery(
    input.ctx.workspace.id,
    `INSERT INTO reactions (id, workspace_id, target_type, target_id, user_id, emoji)
     VALUES ($1, $6, $2, $3, $4, $5)`,
    [newId(), input.targetType, input.targetId, input.ctx.user.id, input.emoji],
  );
  await record({
    workspaceId: input.ctx.workspace.id,
    actorUserId: input.ctx.user.id,
    eventType: 'reaction.added',
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: { emoji: input.emoji },
  });
  return { added: true };
}

/**
 * Summarize reactions for a batch of targets. Returns a map keyed by targetId,
 * each value an array of `ReactionSummary` ordered by count desc.
 */
export async function summarizeReactions(
  ctx: FullAuthContext,
  targetType: ReactionTarget,
  targetIds: string[],
): Promise<Map<string, ReactionSummary[]>> {
  if (targetIds.length === 0) return new Map();
  const { rows } = await tenantPoolQuery<ReactionRow>(
    ctx.workspace.id,
    `SELECT * FROM reactions
       WHERE {TENANT}
         AND target_type = $1
         AND target_id = ANY($2::text[])`,
    [targetType, targetIds],
  );

  const byTarget = new Map<
    string,
    Map<string, { count: number; mine: boolean; userIds: string[] }>
  >();
  for (const r of rows) {
    const targetMap = byTarget.get(r.target_id) ?? new Map();
    const cell = targetMap.get(r.emoji) ?? { count: 0, mine: false, userIds: [] };
    cell.count += 1;
    cell.userIds.push(r.user_id);
    if (r.user_id === ctx.user.id) cell.mine = true;
    targetMap.set(r.emoji, cell);
    byTarget.set(r.target_id, targetMap);
  }

  const result = new Map<string, ReactionSummary[]>();
  for (const [targetId, targetMap] of byTarget) {
    const summaries: ReactionSummary[] = [...targetMap.entries()]
      .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine, userIds: v.userIds }))
      .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    result.set(targetId, summaries);
  }
  return result;
}
