import { randomUUID } from 'node:crypto';
import {
  createWorkspaceForAccount,
  deleteWorkspace,
  getBlobStore,
  listAccountWorkspaceMemberships,
  setDefaultWorkspace,
  switchWorkspaceForAccount,
  transferOwnership,
  updateWorkspace,
} from '@xpntl/domain';
import { Router } from 'express';
import multer from 'multer';
import { getAuth, requireAuth, requireFullAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requireRasterImage } from '../upload-security.js';

export const workspacesRouter: Router = Router();

workspacesRouter.use(requireAuth);

workspacesRouter.get('/memberships', async (req, res) => {
  const memberships = await listAccountWorkspaceMemberships(getAuth(req));
  res.json({
    memberships: memberships.map((entry) => ({
      workspace: toWorkspaceJson(entry.workspace),
      user: toUserJson(entry.user),
      isCurrent: entry.isCurrent,
      isDefault: entry.isDefault,
    })),
  });
});

workspacesRouter.post('/default', async (req, res) => {
  const workspaceId =
    typeof req.body.workspaceId === 'string' && req.body.workspaceId.length > 0
      ? req.body.workspaceId
      : null;
  await setDefaultWorkspace(getAuth(req), workspaceId);
  res.json({ defaultWorkspaceId: workspaceId });
});

workspacesRouter.post('/', async (req, res) => {
  const result = await createWorkspaceForAccount(getAuth(req), {
    workspaceName: req.body.workspaceName,
    workspaceSlug: req.body.workspaceSlug,
    workspaceKey: req.body.workspaceKey,
    displayName: req.body.displayName,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  res.status(201).json({
    workspace: toWorkspaceJson(result.workspace),
    user: toUserJson(result.user),
    token: result.token,
  });
});

workspacesRouter.post('/switch', async (req, res) => {
  const result = await switchWorkspaceForAccount(getAuth(req), {
    workspaceId: req.body.workspaceId,
    workspaceSlug: req.body.workspaceSlug,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  res.json({
    workspace: toWorkspaceJson(result.workspace),
    user: toUserJson(result.user),
    token: result.token,
  });
});

workspacesRouter.patch('/current', requireFullAuth, requireRole('Admin'), async (req, res) => {
  const workspace = await updateWorkspace(getAuth(req), {
    name: req.body.name,
    description: req.body.description,
  });
  res.json({ workspace });
});

const wsAvatarUpload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

workspacesRouter.post(
  '/avatar',
  requireFullAuth,
  requireRole('Admin'),
  wsAvatarUpload.single('avatar'),
  async (req, res) => {
    const store = getBlobStore();
    if (!store) {
      res.status(503).json({
        error: { code: 'service_unavailable', message: 'File storage is not configured' },
      });
      return;
    }
    const file = req.file;
    if (!file) {
      res
        .status(400)
        .json({ error: { code: 'validation_error', message: 'avatar file required' } });
      return;
    }
    const image = requireRasterImage(file, 'Workspace avatar');
    const ctx = getAuth(req);
    const { blobRef } = await store.put({
      kind: 'avatars',
      workspaceId: ctx.workspace.id,
      key: `ws-${randomUUID()}.${image.extension}`,
      body: file.buffer,
      contentType: image.contentType,
    });
    const avatarUrl = store.toProxyUrl(blobRef);
    await updateWorkspace(ctx, { avatarUrl });
    res.json({ avatarUrl });
  },
);

workspacesRouter.post(
  '/transfer-ownership',
  requireFullAuth,
  requireRole('Owner'),
  async (req, res) => {
    const ctx = getAuth(req);
    const { newOwnerId } = req.body;
    if (!newOwnerId || typeof newOwnerId !== 'string') {
      res
        .status(400)
        .json({ error: { code: 'validation_error', message: 'newOwnerId is required' } });
      return;
    }
    await transferOwnership(ctx, newOwnerId);
    res.json({ ok: true });
  },
);

workspacesRouter.delete('/current', requireFullAuth, requireRole('Owner'), async (req, res) => {
  const ctx = getAuth(req);
  await deleteWorkspace(ctx);
  res.json({ ok: true });
});

function toWorkspaceJson(w: {
  id: string;
  slug: string;
  name: string;
  key: string;
  avatar_url?: string | null;
}) {
  return { id: w.id, slug: w.slug, name: w.name, key: w.key, avatarUrl: w.avatar_url ?? null };
}

function toUserJson(u: {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url?: string | null;
  role: string;
  is_super_admin: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    avatarUrl: u.avatar_url ?? null,
    role: u.role,
    isSuperAdmin: u.is_super_admin,
  };
}
