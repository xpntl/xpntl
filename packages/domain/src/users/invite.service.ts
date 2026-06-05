import { nanoid } from 'nanoid';
import type { Role } from '@xpntl/auth';
import { isAtLeast } from '@xpntl/auth';
import { getPool, tenantPoolQuery, tenantClientQuery, withTransaction } from '@xpntl/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';
import * as email from '../email/email.service.js';

const APP_URL = process.env.APP_URL ?? 'https://app.xpntl.dev';

export type PendingInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedByName: string | null;
  invitedByEmail: string;
  createdAt: Date;
};

function inviteEmailContent(opts: {
  inviterName: string | null;
  workspaceName: string;
  role: string;
  token: string;
}): { subject: string; html: string; text: string } {
  const BRAND = {
    bg: '#161210',
    surface: '#1e1a17',
    border: '#2a2520',
    ink: '#ECE6DA',
    muted: '#9a9080',
    accent: '#F3CB00',
    mono: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
  };

  const acceptUrl = `${APP_URL}/invites/accept?token=${encodeURIComponent(opts.token)}`;
  const inviter = opts.inviterName ?? 'Someone';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.mono};color:${BRAND.ink};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};">
<tr><td align="center" style="padding:48px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;">
<tr><td style="padding:40px;">
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.1em;text-transform:uppercase;">WORKSPACE INVITATION</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.02em;">You've been invited.</h1>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
<strong style="color:${BRAND.ink};">${inviter}</strong> has invited you to join <strong style="color:${BRAND.ink};">${opts.workspaceName}</strong> as a <strong style="color:${BRAND.accent};">${opts.role}</strong>.
</p>
<a href="${acceptUrl}" style="display:block;text-align:center;padding:12px;background:${BRAND.accent};color:#180F09;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;">ACCEPT INVITATION</a>
</td></tr>
<tr><td style="padding:0 40px 32px;">
<p style="margin:0;font-size:11px;color:${BRAND.muted};letter-spacing:0.05em;">
XPNTL · close the gap.<br>
If you did not expect this invitation, you can ignore this email.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `You've been invited to ${opts.workspaceName} as a ${opts.role}.

${inviter} sent you this invitation.

Accept here: ${acceptUrl}

— xpntl · close the gap.`;

  return {
    subject: `${inviter} invited you to ${opts.workspaceName} on xpntl`,
    html,
    text,
  };
}

export async function listPendingInvites(ctx: FullAuthContext): Promise<PendingInvite[]> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can view pending invites');
  }

  const { rows } = await tenantPoolQuery<any>(
    ctx.workspace.id,
    `SELECT i.*, u.display_name AS invited_by_name, u.email AS invited_by_email
     FROM workspace_invites i
     JOIN users u ON u.id = i.invited_by
     WHERE i.{TENANT}
     ORDER BY i.created_at DESC`,
  );

  return rows.map((r: any) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    email: r.email,
    role: r.role,
    invitedBy: r.invited_by,
    invitedByName: r.invited_by_name,
    invitedByEmail: r.invited_by_email,
    createdAt: r.created_at,
  }));
}

export async function createWorkspaceInvite(
  ctx: FullAuthContext,
  input: { email: string; role?: Role },
): Promise<PendingInvite> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can invite members');
  }

  const role = input.role ?? 'Member';
  if (role === 'Owner' && !isAtLeast(ctx.user.role, 'Owner')) {
    throw new ForbiddenError('Only owners can invite as Owner');
  }

  if (!/.+@.+\..+/.test(input.email)) {
    throw new ValidationError('Invalid email address');
  }

  // Check if already a member
  const { rows: existing } = await tenantPoolQuery<{ id: string }>(
    ctx.workspace.id,
    `SELECT id FROM users WHERE {TENANT} AND lower(email) = lower($1)`,
    [input.email],
  );
  if (existing.length > 0) {
    throw new ValidationError('A user with this email is already a member of this workspace');
  }

  const id = newId();
  const token = nanoid(32);

  // Upsert: if re-inviting same email, refresh token + timestamp.
  // NB: a plain pooled query — workspace_id is set explicitly here, and this
  // SQL has no {TENANT} placeholder, so tenantPoolQuery (which always appends a
  // workspaceId param) would over-supply a parameter and 500. (XP-69)
  const { rows } = await getPool().query<any>(
    `INSERT INTO workspace_invites (id, workspace_id, email, role, invited_by, token)
     VALUES ($1, $2, lower($3), $4, $5, $6)
     ON CONFLICT (workspace_id, lower(email)) DO UPDATE
       SET role = EXCLUDED.role,
           invited_by = EXCLUDED.invited_by,
           token = EXCLUDED.token,
           updated_at = now()
     RETURNING *`,
    [id, ctx.workspace.id, input.email, role, ctx.user.id, token],
  );

  const invite = rows[0]!;

  // Send email (best-effort — don't fail if email isn't configured)
  try {
    const { workspace } = ctx;
    const content = inviteEmailContent({
      inviterName: ctx.user.display_name,
      workspaceName: workspace.name,
      role,
      token: invite.token,
    });
    await email.send({ to: invite.email, ...content });
  } catch {
    // Email delivery failure is non-fatal
  }

  return {
    id: invite.id,
    workspaceId: invite.workspace_id,
    email: invite.email,
    role: invite.role,
    invitedBy: invite.invited_by,
    invitedByName: ctx.user.display_name,
    invitedByEmail: ctx.user.email,
    createdAt: invite.created_at,
  };
}

export async function resendWorkspaceInvite(
  ctx: FullAuthContext,
  inviteId: string,
): Promise<{ ok: boolean }> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can resend invites');
  }

  const { rows } = await tenantPoolQuery<any>(
    ctx.workspace.id,
    `UPDATE workspace_invites
        SET token = $1, updated_at = now()
      WHERE {TENANT} AND id = $2
      RETURNING *`,
    [nanoid(32), inviteId],
  );

  if (!rows[0]) throw new NotFoundError('Invite not found');

  const invite = rows[0];

  try {
    const content = inviteEmailContent({
      inviterName: ctx.user.display_name,
      workspaceName: ctx.workspace.name,
      role: invite.role,
      token: invite.token,
    });
    await email.send({ to: invite.email, ...content });
  } catch {
    // Non-fatal
  }

  return { ok: true };
}

export async function revokeWorkspaceInvite(
  ctx: FullAuthContext,
  inviteId: string,
): Promise<{ ok: boolean }> {
  if (!isAtLeast(ctx.user.role, 'Admin')) {
    throw new ForbiddenError('Only admins and owners can revoke invites');
  }

  const { rowCount } = await tenantPoolQuery(
    ctx.workspace.id,
    `DELETE FROM workspace_invites WHERE {TENANT} AND id = $1`,
    [inviteId],
  );

  if (!rowCount) throw new NotFoundError('Invite not found');
  return { ok: true };
}
