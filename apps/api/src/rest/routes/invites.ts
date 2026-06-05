import { acceptWorkspaceInvite } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireAuth } from '../../middleware/auth.js';

export const invitesRouter: Router = Router();

// Accepting an invite is account-scoped, not workspace-scoped: the invite points
// at a workspace the caller is (usually) not yet a member of. requireAuth (any
// session, partial or full) is correct here — requireFullAuth would wrongly
// reject a brand-new account that has no workspace yet.
invitesRouter.use(requireAuth);

invitesRouter.post('/accept', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    res.status(400).json({ error: { code: 'validation_error', message: 'token is required' } });
    return;
  }
  // Returns a session bound to the joined workspace — same shape as
  // /v1/workspaces/switch, so the client just calls setSession(result).
  const result = await acceptWorkspaceInvite(getAuth(req), {
    token,
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });
  res.json({
    workspace: toWorkspaceJson(result.workspace),
    user: toUserJson(result.user),
    token: result.token,
  });
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
