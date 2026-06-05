import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select } from '@xpntl/ui';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function SettingsWorkspacesPage() {
  const navigate = useNavigate();
  const { memberships, token, workspace, user, setSession, setMemberships } = useAuth();

  const [createWorkspaceName, setCreateWorkspaceName] = useState('');
  const [createWorkspaceSlug, setCreateWorkspaceSlug] = useState('');
  const [createWorkspaceKey, setCreateWorkspaceKey] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState<string | null>(null);

  const membershipOptions = useMemo(
    () =>
      memberships.map((membership) => ({
        value: membership.workspace.id,
        label: `${membership.workspace.name} · ${membership.workspace.key} · ${membership.user.role}`,
      })),
    [memberships],
  );

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
      setCreateMsg(err instanceof FetchError ? err.message : 'Failed to switch workspace');
    } finally {
      setSwitchBusy(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateBusy(true);
    setCreateMsg(null);
    try {
      const result = await api.createWorkspaceFromSession(
        {
          workspaceName: createWorkspaceName.trim(),
          workspaceSlug: createWorkspaceSlug.trim().toLowerCase(),
          workspaceKey: createWorkspaceKey.trim().toUpperCase(),
        },
        token,
      );
      setSession(result);
      setCreateWorkspaceName('');
      setCreateWorkspaceSlug('');
      setCreateWorkspaceKey('');
      await refreshMemberships(result.token);
      setCreateMsg('Workspace created under your current account.');
      navigate('/');
    } catch (err) {
      setCreateMsg(err instanceof FetchError ? err.message : 'Failed to create workspace');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Workspaces</h1>
      <p style={{ maxWidth: 760, fontSize: 12, color: 'var(--xp-muted)', lineHeight: 1.6 }}>
        Your account can belong to multiple workspaces. Switching uses your current permissions and
        does not ask you to sign in again.
      </p>

      <section style={sectionStyle}>
        <SectionTitle>Your Workspaces</SectionTitle>
        {memberships.length === 0 ? (
          <div style={hintStyle}>No workspace memberships found for this account yet.</div>
        ) : (
          <>
            <div style={{ maxWidth: 560, marginBottom: 14 }}>
              <Select
                value={workspace?.id ?? ''}
                onValueChange={(workspaceId) => {
                  if (workspaceId && workspaceId !== workspace?.id) {
                    void handleSwitch(workspaceId);
                  }
                }}
                options={membershipOptions}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memberships.map((membership) => {
                const isCurrent = membership.isCurrent;
                return (
                  <div key={membership.workspace.id} style={workspaceCardStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <strong style={{ fontSize: 13 }}>{membership.workspace.name}</strong>
                        <span className="xp-meta">
                          {membership.workspace.slug} · {membership.workspace.key}
                        </span>
                        <span className="xp-meta">{membership.user.role}</span>
                        {isCurrent && (
                          <span
                            style={{
                              color: 'var(--xp-accent-strong)',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            CURRENT
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--xp-muted)' }}>
                        {membership.user.displayName ?? user?.displayName ?? membership.user.email}
                      </div>
                    </div>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => void handleSwitch(membership.workspace.id)}
                        style={secondaryButtonStyle}
                      >
                        {switchBusy === membership.workspace.id ? 'Switching…' : 'Switch'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section style={sectionStyle}>
        <SectionTitle>Create New Workspace</SectionTitle>
        <p style={hintStyle}>
          This creates a new workspace and adds your current account as the owner. No extra user or
          password is created.
        </p>
        <form onSubmit={handleCreate} style={formStyle}>
          <Field label="Workspace name">
            <FieldInput
              value={createWorkspaceName}
              onChange={(e) => setCreateWorkspaceName(e.target.value)}
              placeholder="Acme"
              required
            />
          </Field>
          <Field label="Workspace slug">
            <FieldInput
              value={createWorkspaceSlug}
              onChange={(e) => setCreateWorkspaceSlug(e.target.value)}
              placeholder="acme"
              required
            />
          </Field>
          <Field label="Issue key prefix">
            <FieldInput
              value={createWorkspaceKey}
              onChange={(e) => setCreateWorkspaceKey(e.target.value.toUpperCase())}
              placeholder="ACME"
              required
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" disabled={createBusy} style={primaryButtonStyle}>
              {createBusy ? 'Creating…' : 'Create Workspace'}
            </button>
            {createMsg && (
              <span
                style={{
                  fontSize: 11,
                  color: createMsg.startsWith('Workspace created')
                    ? 'var(--xp-success)'
                    : 'var(--xp-danger)',
                }}
              >
                {createMsg}
              </span>
            )}
          </div>
        </form>
      </section>
    </SettingsLayout>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="xp-meta">{label}</span>
      {children}
    </label>
  );
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

const sectionStyle: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 20,
  borderTop: '1px solid var(--xp-hairline)',
};

const formStyle: React.CSSProperties = {
  maxWidth: 560,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const hintStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--xp-muted)',
  marginBottom: 12,
  lineHeight: 1.6,
};

const workspaceCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-surface)',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-accent)',
  color: 'var(--xp-accent-fg)',
  border: 'none',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11.5,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};
