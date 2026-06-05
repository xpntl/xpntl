import { randomUUID } from 'node:crypto';
import type { Role } from '@xpntl/auth';
import {
  changePassword,
  changeUserRole,
  getBlobStore,
  inviteWorkspaceMember,
  invites,
  listUserSessions,
  listWorkspaceUsers,
  removeWorkspaceMember,
  revokeAllSessions,
  revokeUserSession,
  updateProfile,
} from '@xpntl/domain';
import { Router } from 'express';
import multer from 'multer';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requireRasterImage } from '../upload-security.js';

export const usersRouter: Router = Router();

usersRouter.use(requireFullAuth);

usersRouter.get('/', async (req, res) => {
  const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const { users, nextCursor } = await listWorkspaceUsers(getAuth(req), { limit, cursor });
  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      role: u.role,
      isAgent: u.is_agent,
      agentHarness: u.agent_harness,
      lastSeenAt: u.last_seen_at,
    })),
    nextCursor,
  });
});

usersRouter.patch('/me', async (req, res) => {
  const user = await updateProfile(getAuth(req), {
    displayName: req.body.displayName,
    avatarUrl: req.body.avatarUrl,
  });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
      isSuperAdmin: user.is_super_admin,
    },
  });
});

const avatarUpload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

usersRouter.post('/me/avatar', avatarUpload.single('avatar'), async (req, res) => {
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
  const user = await updateProfile(ctx, { avatarUrl });
  res.json({ avatarUrl: user.avatar_url });
});

usersRouter.patch('/me/password', async (req, res) => {
  await changePassword(getAuth(req), {
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  res.json({ ok: true });
});

usersRouter.get('/me/sessions', async (req, res) => {
  const sessions = await listUserSessions(getAuth(req));
  res.json({ sessions });
});

usersRouter.delete('/me/sessions/:id', async (req, res) => {
  await revokeUserSession(getAuth(req), String(req.params.id));
  res.json({ ok: true });
});

usersRouter.delete('/me/sessions', async (req, res) => {
  const revoked = await revokeAllSessions(getAuth(req));
  res.json({ revoked });
});

usersRouter.patch('/:id/role', requireRole('Admin'), async (req, res) => {
  const user = await changeUserRole(getAuth(req), {
    userId: String(req.params.id),
    newRole: req.body.role as Role,
  });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
    },
  });
});

usersRouter.delete('/:id', requireRole('Admin'), async (req, res) => {
  await removeWorkspaceMember(getAuth(req), String(req.params.id));
  res.status(204).end();
});

usersRouter.post('/invite', requireRole('Admin'), async (req, res) => {
  const user = await inviteWorkspaceMember(getAuth(req), {
    email: req.body.email,
    role: req.body.role,
    displayName: req.body.displayName,
  });
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
    },
  });
});

// ── Pending invites ──────────────────────────────────────────────────────────

usersRouter.get('/pending-invites', requireRole('Admin'), async (req, res) => {
  const list = await invites.listPendingInvites(getAuth(req));
  res.json({ invites: list });
});

usersRouter.post('/pending-invites', requireRole('Admin'), async (req, res) => {
  const invite = await invites.createWorkspaceInvite(getAuth(req), {
    email: req.body.email,
    role: req.body.role as Role | undefined,
  });
  res.status(201).json({ invite });
});

usersRouter.post('/pending-invites/:id/resend', requireRole('Admin'), async (req, res) => {
  const result = await invites.resendWorkspaceInvite(getAuth(req), String(req.params.id));
  res.json(result);
});

usersRouter.delete('/pending-invites/:id', requireRole('Admin'), async (req, res) => {
  const result = await invites.revokeWorkspaceInvite(getAuth(req), String(req.params.id));
  res.json(result);
});
