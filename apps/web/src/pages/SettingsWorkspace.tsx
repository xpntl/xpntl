import { Avatar } from '@xpntl/ui';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useUsers } from '../lib/user-store';

export function SettingsWorkspacePage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Workspace</h1>
      <WorkspaceForm />
      <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />
      <SwitchWorkspaceSection />
      <DangerZone />
    </SettingsLayout>
  );
}

function WorkspaceForm() {
  const { workspace, token, setProfile, user } = useAuth();
  const [name, setName] = useState(workspace?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [wsAvatarUrl, setWsAvatarUrl] = useState<string | null>(workspace?.avatarUrl ?? null);
  const wsFileRef = useRef<HTMLInputElement>(null);

  async function handleWsAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const { avatarUrl: url } = await api.updateWorkspaceAvatar(file, token);
      setWsAvatarUrl(url);
      // Reflect immediately in the sidebar/menu.
      if (workspace && user) setProfile({ workspace: { ...workspace, avatarUrl: url }, user });
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to upload avatar');
    } finally {
      setAvatarBusy(false);
      if (wsFileRef.current) wsFileRef.current.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { workspace: updated } = await api.updateWorkspace({ name }, token);
      if (user)
        setProfile({
          workspace: { id: updated.id, slug: updated.slug, name: updated.name, key: updated.key, avatarUrl: updated.avatarUrl ?? workspace?.avatarUrl ?? null },
          user,
        });
      setMsg('Workspace updated');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
      <Label>Avatar</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar
          name={workspace?.name || '?'}
          size={64}
          src={wsAvatarUrl ?? undefined}
        />
        <div>
          <button
            type="button"
            disabled={avatarBusy}
            onClick={() => wsFileRef.current?.click()}
            style={{
              padding: '5px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-surface)',
              color: 'var(--xp-ink)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              cursor: avatarBusy ? 'wait' : 'pointer',
              opacity: avatarBusy ? 0.6 : 1,
            }}
          >
            {avatarBusy ? 'Uploading…' : 'Change Avatar'}
          </button>
          <input
            ref={wsFileRef}
            type="file"
            accept="image/*"
            onChange={handleWsAvatarChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      <Label>Name</Label>
      <FieldInput value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ marginTop: 8 }}>
        <Label>Slug</Label>
        <FieldInput value={workspace?.slug ?? ''} disabled style={{ opacity: 0.5 }} />
        <Hint>Slug cannot be changed.</Hint>
      </div>
      <div style={{ marginTop: 8 }}>
        <Label>Key</Label>
        <FieldInput value={workspace?.key ?? ''} disabled style={{ opacity: 0.5 }} />
        <Hint>Key is permanent — it drives issue identifiers.</Hint>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <SaveButton busy={busy} />
        {msg && (
          <span
            style={{
              fontSize: 11,
              color: msg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)',
            }}
          >
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--xp-ink)' }}>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, color: 'var(--xp-faint)', marginTop: 4 }}>{children}</div>;
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        display: 'block',
        width: '100%',
        height: 'var(--xp-input-h)',
        padding: '0 10px',
        fontSize: 12.5,
        fontFamily: 'var(--xp-font-mono)',
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-ink)',
        outline: 'none',
        ...props.style,
      }}
    />
  );
}

function SaveButton({ busy, label = 'Save' }: { busy: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={{
        padding: '6px 16px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--xp-font-mono)',
        background: 'var(--xp-accent)',
        color: 'var(--xp-accent-fg)',
        border: 'none',
        borderRadius: 'var(--xp-r-sm)',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? 'Saving…' : label}
    </button>
  );
}

function SwitchWorkspaceSection() {
  const navigate = useNavigate();
  const { memberships, token, workspace, user, setSession, setMemberships } = useAuth();
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState<string | null>(null);
  const [isFreePlan, setIsFreePlan] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getSubscription(token).then(({ subscription }) => {
      setIsFreePlan(!subscription || subscription.planId === 'free');
    }).catch(() => setIsFreePlan(true));
  }, [token]);

  const ownsWorkspace = memberships.some((m) => m.user.role === 'Owner');
  const createBlocked = isFreePlan && ownsWorkspace;

  async function refreshMemberships(nextToken = token) {
    if (!nextToken) return;
    const result = await api.listWorkspaceMemberships(nextToken);
    setMemberships(result.memberships);
  }

  async function handleSwitch(workspaceId: string) {
    if (!token) return;
    setSwitchBusy(workspaceId);
    try {
      const result = await api.switchWorkspace({ workspaceId }, token);
      setSession(result);
      await refreshMemberships(result.token);
      navigate('/');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to switch workspace');
    } finally {
      setSwitchBusy(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateBusy(true);
    setMsg(null);
    try {
      const result = await api.createWorkspaceFromSession(
        {
          workspaceName: createName.trim(),
          workspaceSlug: createSlug.trim().toLowerCase(),
          workspaceKey: createKey.trim().toUpperCase(),
        },
        token,
      );
      setSession(result);
      setCreateName('');
      setCreateSlug('');
      setCreateKey('');
      await refreshMemberships(result.token);
      navigate('/');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to create workspace');
    } finally {
      setCreateBusy(false);
    }
  }

  const otherWorkspaces = memberships.filter((m) => !m.isCurrent);

  return (
    <div>
      <Label>Switch Workspace</Label>
      {otherWorkspaces.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--xp-faint)', marginBottom: 12 }}>
          No other workspaces on this account.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {otherWorkspaces.map((m) => (
            <div
              key={m.workspace.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                background: 'var(--xp-surface)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 12 }}>{m.workspace.name}</strong>
                <span
                  style={{ fontSize: 10.5, color: 'var(--xp-faint)', marginLeft: 8 }}
                >
                  {m.workspace.slug} · {m.workspace.key} · {m.user.role}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleSwitch(m.workspace.id)}
                disabled={switchBusy === m.workspace.id}
                style={{
                  padding: '4px 12px',
                  fontSize: 11,
                  fontFamily: 'var(--xp-font-mono)',
                  background: 'var(--xp-canvas)',
                  color: 'var(--xp-ink)',
                  border: '1px solid var(--xp-border)',
                  borderRadius: 'var(--xp-r-sm)',
                  cursor: switchBusy === m.workspace.id ? 'wait' : 'pointer',
                }}
              >
                {switchBusy === m.workspace.id ? 'Switching…' : 'Switch'}
              </button>
            </div>
          ))}
        </div>
      )}

      <Label>Create New Workspace</Label>
      {createBlocked ? (
        <div style={{ fontSize: 11.5, color: 'var(--xp-muted)', marginTop: 4 }}>
          Your Free plan is limited to 1 workspace.{' '}
          <Link to="/settings/billing" style={{ color: 'var(--xp-accent-strong)', textDecoration: 'underline' }}>
            Upgrade to Pro
          </Link>{' '}
          to create more.
        </div>
      ) : (
        <>
          <Hint>Creates a new workspace under your current account.</Hint>
          <form onSubmit={handleCreate} style={{ maxWidth: 400, marginTop: 8 }}>
            <FieldInput
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Workspace name"
              required
              style={{ marginBottom: 6 }}
            />
            <FieldInput
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              placeholder="slug"
              required
              style={{ marginBottom: 6 }}
            />
            <FieldInput
              value={createKey}
              onChange={(e) => setCreateKey(e.target.value.toUpperCase())}
              placeholder="KEY"
              required
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SaveButton busy={createBusy} label="Create" />
              {msg && (
                <span
                  style={{
                    fontSize: 11,
                    color: msg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)',
                  }}
                >
                  {msg}
                </span>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}


function DangerZone() {
  const { user, workspace, token, clear } = useAuth();
  const navigate = useNavigate();
  const usersById = useUsers((s) => s.byId);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState<'transfer' | 'delete' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (token) void useUsers.getState().load(token);
  }, [token]);

  // Owner-only zone — the backend also enforces requireRole('Owner').
  if (user?.role !== 'Owner') return null;

  const members = Object.values(usersById).filter((u) => u.id !== user.id && !u.isAgent);

  async function handleTransfer() {
    if (!newOwnerId) return;
    setBusy('transfer');
    setMsg(null);
    try {
      await api.transferWorkspaceOwnership(newOwnerId, token);
      setMsg('Ownership transferred. You are now an Admin — reload to refresh your role.');
      setNewOwnerId('');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to transfer ownership');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (confirmName !== workspace?.name) return;
    setBusy('delete');
    setMsg(null);
    try {
      await api.deleteCurrentWorkspace(token);
      clear();
      navigate('/signin');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to delete workspace');
      setBusy(null);
    }
  }

  return (
    <>
      <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />
      <div
        style={{
          border: '1px solid var(--xp-danger)',
          borderRadius: 'var(--xp-r-sm)',
          padding: 16,
          maxWidth: 460,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--xp-danger)', marginBottom: 12 }}>
          Danger Zone
        </div>

        <Label>Transfer ownership</Label>
        <Hint>Hand ownership to another member. You become an Admin.</Hint>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, marginBottom: 16 }}>
          <select
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            style={{
              flex: 1,
              height: 'var(--xp-input-h)',
              padding: '0 10px',
              fontSize: 12.5,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-surface)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
            }}
          >
            <option value="">Select a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName ?? m.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!newOwnerId || busy !== null}
            onClick={handleTransfer}
            style={dangerBtn(!newOwnerId || busy !== null)}
          >
            {busy === 'transfer' ? 'Transferring…' : 'Transfer'}
          </button>
        </div>

        <Label>Delete this workspace</Label>
        <Hint>
          Permanently deletes <strong>{workspace?.name}</strong> and all its data. Type the
          workspace name to confirm.
        </Hint>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <FieldInput
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={workspace?.name ?? 'workspace name'}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            disabled={confirmName !== workspace?.name || busy !== null}
            onClick={handleDelete}
            style={dangerBtn(confirmName !== workspace?.name || busy !== null, true)}
          >
            {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        {msg && (
          <div
            style={{
              fontSize: 11,
              marginTop: 12,
              color: msg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)',
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </>
  );
}

function dangerBtn(disabled: boolean, filled = false): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--xp-font-mono)',
    background: filled ? 'var(--xp-danger)' : 'var(--xp-surface)',
    color: filled ? '#fff' : 'var(--xp-danger)',
    border: '1px solid var(--xp-danger)',
    borderRadius: 'var(--xp-r-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  };
}
