import { randomUUID } from 'node:crypto';
import { type UserRow, agents, getBlobStore, harnessKeys } from '@xpntl/domain';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';
import { requireRasterImage } from '../upload-security.js';

export const agentsRouter: Router = Router();

agentsRouter.use(requireFullAuth);

agentsRouter.get('/activity', async (req, res) => {
  const ctx = getAuth(req);
  const entries = await agents.listAgentActivity(ctx, {
    agentId: req.query.agentId as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    cursor: req.query.cursor as string | undefined,
  });
  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      agentId: e.actor_user_id,
      displayName: e.display_name,
      harness: e.agent_harness,
      avatarUrl: e.avatar_url,
      eventType: e.event_type,
      targetType: e.target_type,
      targetId: e.target_id,
      metadata: e.metadata,
      createdAt: e.created_at,
    })),
  });
});

const createAgentSchema = z.object({
  displayName: z.string().min(1).max(100),
  harness: z.enum(['claude_code', 'codex', 'cursor', 'opencode', 'custom']),
});

agentsRouter.get('/', async (req, res) => {
  const list = await agents.listAgentUsers(getAuth(req));
  res.json({ agents: list.map(toAgentJson) });
});

agentsRouter.post('/', async (req, res) => {
  const input = createAgentSchema.parse(req.body);
  const agent = await agents.createAgentUser(getAuth(req), input);
  // Return the agent in the same WorkspaceUser shape as GET /v1/users, under
  // `user`, so the Team page can append it directly to its member list. The
  // previous `{ agent: ... }` shape (with `harness`, no `role`) didn't match
  // WorkspaceUser — the client read `undefined` and crashed on `.displayName`.
  res.status(201).json({ user: toMemberJson(agent) });
});

agentsRouter.get('/:id', async (req, res) => {
  const agent = await agents.getAgentUser(getAuth(req), req.params.id as string);
  res.json({ agent: toAgentJson(agent) });
});

agentsRouter.delete('/:id', async (req, res) => {
  await agents.deleteAgentUser(getAuth(req), req.params.id as string);
  res.status(204).end();
});

const updateAgentSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  harness: z.enum(['claude_code', 'codex', 'cursor', 'opencode', 'custom']).optional(),
  avatarUrl: z.string().max(2000).nullable().optional(),
});

agentsRouter.patch('/:id', async (req, res) => {
  const input = updateAgentSchema.parse(req.body);
  const agent = await agents.updateAgentUser(getAuth(req), req.params.id as string, input);
  // Return the WorkspaceUser shape (matching POST /v1/agents and GET /v1/users)
  // so the Team page can splice the updated row straight into its member list.
  res.json({ user: toMemberJson(agent) });
});

const avatarUpload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

// Upload a custom avatar for an agent. Mirrors POST /v1/users/me/avatar but
// targets the agent row (validated workspace-scoped by updateAgentUser).
agentsRouter.post('/:id/avatar', avatarUpload.single('avatar'), async (req, res) => {
  const store = getBlobStore();
  if (!store) {
    res
      .status(503)
      .json({ error: { code: 'service_unavailable', message: 'File storage is not configured' } });
    return;
  }
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { code: 'validation_error', message: 'avatar file required' } });
    return;
  }
  const image = requireRasterImage(file, 'Avatar');
  const ctx = getAuth(req);
  const { blobRef } = await store.put({
    kind: 'avatars',
    workspaceId: ctx.workspace.id,
    key: `${randomUUID()}.${image.extension}`,
    body: file.buffer,
    contentType: image.contentType,
  });
  const avatarUrl = store.toProxyUrl(blobRef);
  const agent = await agents.updateAgentUser(ctx, req.params.id as string, { avatarUrl });
  res.json({ avatarUrl: agent.avatar_url, user: toMemberJson(agent) });
});

const linkKeySchema = z.object({
  harnessKeyId: z.string().min(1),
});

agentsRouter.post('/:id/link-key', async (req, res) => {
  const input = linkKeySchema.parse(req.body);
  await agents.linkHarnessKeyToAgent(getAuth(req), input.harnessKeyId, req.params.id as string);
  res.json({ linked: true });
});

const createAgentKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// Generate a harness key already bound to this agent, so the harness
// authenticates AS the agent (its board activity is attributed to the agent,
// not to whoever created the key). Plaintext key is returned once.
agentsRouter.post('/:id/keys', async (req, res) => {
  const ctx = getAuth(req);
  const agent = await agents.getAgentUser(ctx, req.params.id as string);
  const { name } = createAgentKeySchema.parse(req.body ?? {});
  const { key, record } = await harnessKeys.createHarnessKey(
    ctx,
    name?.trim() || `${agent.display_name ?? 'Agent'} connection`,
    ctx.account.id,
    agent.id,
  );
  res.status(201).json({ key, keyId: record.id });
});

function toAgentJson(u: UserRow) {
  return {
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    avatarUrl: u.avatar_url,
    harness: u.agent_harness,
    isAgent: true,
    createdAt: u.created_at,
  };
}

// WorkspaceUser shape — matches GET /v1/users so an agent can slot straight
// into the Team page member list (note `agentHarness`, `role`, `isAgent`).
function toMemberJson(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    role: u.role,
    isAgent: true,
    agentHarness: u.agent_harness,
  };
}
