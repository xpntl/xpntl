import { Avatar, Select } from '@xpntl/ui';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { AgentAvatar } from '../components/AgentBadge';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, type PendingInvite, type WorkspaceUser, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { alertNotice, confirm } from '../lib/confirm-store';
import { formatRelative } from '../lib/format';
import { isAtLeast } from '../lib/roles';

const HARNESS_OPTIONS = [
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'custom', label: 'Custom' },
];

const HARNESS_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  custom: 'Custom',
};

const MCP_URL = 'https://api.xpntl.dev/mcp';

type HarnessConnectionGuide = {
  label: string;
  command: string;
  copyLabel?: string;
  note?: string;
};

function harnessConnectionGuide(
  harness: string | null | undefined,
  apiKey: string,
): HarnessConnectionGuide {
  if (harness === 'codex') {
    return {
      label: 'Codex',
      command: `export XPNTL_HARNESS_KEY="${apiKey}"\n\ncodex mcp add xpntl --url ${MCP_URL} --bearer-token-env-var XPNTL_HARNESS_KEY`,
      copyLabel: 'Copy instructions',
      note: 'Codex reads the bearer token from the environment variable, so the key is not written into Codex config.',
    };
  }

  if (harness === 'cursor') {
    return {
      label: 'Cursor',
      command: `export XPNTL_HARNESS_KEY="${apiKey}"\n\nAdd this to .cursor/mcp.json or ~/.cursor/mcp.json:\n\n{\n  "mcpServers": {\n    "xpntl": {\n      "url": "${MCP_URL}",\n      "headers": {\n        "Authorization": "Bearer \${env:XPNTL_HARNESS_KEY}"\n      }\n    }\n  }\n}`,
      copyLabel: 'Copy instructions',
      note: 'Cursor resolves environment variables inside mcp.json headers, so keep the key in XPNTL_HARNESS_KEY.',
    };
  }

  if (harness === 'opencode') {
    return {
      label: 'OpenCode',
      command: `export XPNTL_HARNESS_KEY="${apiKey}"\n\nAdd this to opencode.json:\n\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "xpntl": {\n      "type": "remote",\n      "url": "${MCP_URL}",\n      "oauth": false,\n      "headers": {\n        "Authorization": "Bearer {env:XPNTL_HARNESS_KEY}"\n      },\n      "enabled": true\n    }\n  }\n}`,
      copyLabel: 'Copy instructions',
      note: 'OpenCode supports remote MCP headers; oauth is disabled here because xpntl uses the harness key as a bearer token.',
    };
  }

  if (harness === 'custom') {
    return {
      label: 'Custom',
      command: `MCP URL: ${MCP_URL}\nAuthorization header: Bearer ${apiKey}`,
      copyLabel: 'Copy instructions',
      note: 'Use a Streamable HTTP MCP server and send the harness key as an Authorization bearer token.',
    };
  }

  return {
    label: 'Claude Code',
    command: `claude mcp add xpntl --transport http \\\n  ${MCP_URL} \\\n  --header "Authorization: Bearer ${apiKey}"`,
  };
}

function harnessPlaceholderGuide(harness: string): HarnessConnectionGuide {
  return harnessConnectionGuide(harness, '<harness-key>');
}

const ROLE_OPTIONS = [
  { value: 'Guest', label: 'Guest' },
  { value: 'Member', label: 'Member' },
  { value: 'Admin', label: 'Admin' },
];

export function SettingsTeamPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Team</h1>
      <TeamSection />
    </SettingsLayout>
  );
}

function TeamSection() {
  const { token, user } = useAuth();
  const [members, setMembers] = useState<WorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Add agent state
  const [agentName, setAgentName] = useState('');
  const [agentHarness, setAgentHarness] = useState('claude_code');
  const [addBusy, setAddBusy] = useState(false);
  const [agentMsg, setAgentMsg] = useState<string | null>(null);

  // Agent being edited (rename / change harness / custom avatar)
  const [editing, setEditing] = useState<WorkspaceUser | null>(null);

  // Per-agent connection key (generate + reveal once)
  const [connectBusy, setConnectBusy] = useState<string | null>(null);
  const [keyReveal, setKeyReveal] = useState<{
    name: string;
    key: string;
    harness: string | null;
  } | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // Pending invites state
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const users: WorkspaceUser[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.listUsers(token, { limit: 200, cursor });
        users.push(...page.users);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      setMembers(users);
    })().finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api
      .listPendingInvites(token)
      .then((r) => setPendingInvites(r.invites))
      .catch(() => {});
  }, [token]);

  const sorted = [...members].sort((a, b) =>
    (a.displayName ?? '').localeCompare(b.displayName ?? ''),
  );

  const canManage = user && isAtLeast(user.role, 'Admin');
  const isOwner = user && isAtLeast(user.role, 'Owner');

  async function handleAddAgent(e: FormEvent) {
    e.preventDefault();
    const trimmed = agentName.trim();
    if (!trimmed) return;
    setAddBusy(true);
    setAgentMsg(null);
    try {
      const { user: newAgent } = await api.createAgent(
        { displayName: trimmed, harness: agentHarness },
        token,
      );
      setMembers((m) => [...m, newAgent]);
      setAgentName('');
      setAgentHarness('claude_code');
      setAgentMsg(`${newAgent.displayName} added — connect its harness below.`);
    } catch (err) {
      setAgentMsg(err instanceof FetchError ? err.message : 'Failed to add agent');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleConnect(m: WorkspaceUser) {
    setConnectBusy(m.id);
    try {
      const { key } = await api.createAgentKey(m.id, token);
      setKeyReveal({ name: m.displayName ?? 'Agent', key, harness: m.agentHarness ?? null });
    } catch (err) {
      await alertNotice({
        message: err instanceof FetchError ? err.message : 'Failed to generate connection key',
      });
    } finally {
      setConnectBusy(null);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      const { invite } = await api.createPendingInvite(
        { email: inviteEmail, role: inviteRole },
        token,
      );
      setPendingInvites((prev) => {
        // Replace if already in list (upsert), otherwise prepend
        const existing = prev.findIndex((p) => p.email === invite.email);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = invite;
          return next;
        }
        return [invite, ...prev];
      });
      setInviteEmail('');
      setInviteMsg('Invite sent');
    } catch (err) {
      setInviteMsg(err instanceof FetchError ? err.message : 'Failed to invite');
    } finally {
      setInviteBusy(false);
    }
  }

  // Merge (don't replace) so fields the agent endpoints omit — e.g. lastSeenAt —
  // survive the update and the presence dot doesn't flip to offline.
  function applyAgentUpdate(updated: WorkspaceUser) {
    setMembers((m) => m.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
  }

  async function changeRole(userId: string, role: string) {
    try {
      const { user: updated } = await api.changeUserRole(userId, role, token);
      setMembers((m) => m.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      await alertNotice({ message: err instanceof FetchError ? err.message : 'Failed' });
    }
  }

  async function handleRemove(member: WorkspaceUser) {
    const label = member.isAgent ? 'agent' : 'member';
    const ok = await confirm({
      title: `Remove ${label}`,
      message: `Remove this ${label} from the workspace?${member.isAgent ? ' This cannot be undone.' : ''}`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      if (member.isAgent) {
        await api.deleteAgent(member.id, token);
      } else {
        await api.removeUser(member.id, token);
      }
      setMembers((m) => m.filter((u) => u.id !== member.id));
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : `Failed to remove ${label}`);
    }
  }

  async function handleResendInvite(invite: PendingInvite) {
    try {
      await api.resendPendingInvite(invite.id, token);
      await alertNotice({ message: `Invite re-sent to ${invite.email}` });
    } catch (err) {
      await alertNotice({ message: err instanceof FetchError ? err.message : 'Failed to resend' });
    }
  }

  async function handleRevokeInvite(invite: PendingInvite) {
    const ok = await confirm({
      title: 'Revoke invite',
      message: `Revoke the invite sent to ${invite.email}?`,
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.revokePendingInvite(invite.id, token);
      setPendingInvites((prev) => prev.filter((p) => p.id !== invite.id));
    } catch (err) {
      await alertNotice({ message: err instanceof FetchError ? err.message : 'Failed to revoke' });
    }
  }

  return (
    <div>
      <Label>Members ({members.length})</Label>
      <p style={sectionHintStyle}>
        Humans and agents share one roster. Invite people below; add agents and connect their coding
        harness further down.
      </p>

      {msg && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--xp-danger)',
            marginBottom: 12,
            padding: '6px 10px',
            background: 'var(--xp-surface)',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
          }}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--xp-faint)' }}>Loading...</div>
      ) : (
        <table
          style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', marginBottom: 16 }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--xp-hairline)', textAlign: 'left' }}>
              <th style={thStyle} />
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Harness</th>
              {canManage && <th style={thStyle} />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--xp-hairline)' }}>
                <td style={{ ...tdStyle, width: 32 }}>
                  <AgentAvatar
                    name={m.displayName ?? m.email}
                    size={24}
                    src={m.avatarUrl ?? undefined}
                    isAgent={m.isAgent}
                    harness={m.agentHarness}
                  />
                </td>
                <td style={tdStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <PresenceDot lastSeenAt={m.lastSeenAt} isAgent={m.isAgent} />
                    {m.displayName ?? '—'}
                    {m.id === user?.id ? (
                      <span style={{ color: 'var(--xp-faint)', marginLeft: 2 }}>(you)</span>
                    ) : (
                      ''
                    )}
                  </span>
                </td>
                <td style={tdStyle}>{m.email}</td>
                <td style={tdStyle}>
                  <span
                    title={m.isAgent ? 'AI agent member' : 'Human member'}
                    style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 'var(--xp-r-sm)',
                      background: m.isAgent ? 'var(--xp-accent)' : 'var(--xp-surface)',
                      color: m.isAgent ? 'var(--xp-accent-fg)' : 'var(--xp-ink)',
                      border: m.isAgent ? 'none' : '1px solid var(--xp-border)',
                    }}
                  >
                    {m.isAgent ? 'Agent' : 'Human'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {canManage && !m.isAgent && m.id !== user?.id ? (
                    <Select
                      value={m.role}
                      onValueChange={(value) => changeRole(m.id, value)}
                      options={[
                        ...ROLE_OPTIONS,
                        ...(isOwner ? [{ value: 'Owner', label: 'Owner' }] : []),
                      ]}
                    />
                  ) : (
                    m.role
                  )}
                </td>
                <td style={tdStyle}>
                  {m.isAgent && m.agentHarness
                    ? (HARNESS_LABELS[m.agentHarness] ?? m.agentHarness)
                    : '—'}
                </td>
                {canManage && (
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      {m.isAgent && (
                        <button
                          type="button"
                          onClick={() => setEditing(m)}
                          style={{ ...inviteActionBtnStyle, color: 'var(--xp-accent-strong)' }}
                        >
                          Edit
                        </button>
                      )}
                      {m.isAgent && (
                        <button
                          type="button"
                          onClick={() => handleConnect(m)}
                          disabled={connectBusy === m.id}
                          style={{ ...inviteActionBtnStyle, color: 'var(--xp-accent-strong)' }}
                        >
                          {connectBusy === m.id ? 'Generating…' : 'Connect'}
                        </button>
                      )}
                      {m.id !== user?.id && m.role !== 'Owner' && (
                        <button type="button" onClick={() => handleRemove(m)} style={linkBtnStyle}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && (
        <>
          <SectionDivider />
          <Label>Invite member</Label>
          <p style={sectionHintStyle}>
            Send an email invite. They join with the role you pick and can sign in with SSO.
          </p>
          <form onSubmit={handleInvite} style={formCardStyle}>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <SmallLabel>Email</SmallLabel>
              <FieldInput
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
            </div>
            <div style={{ width: 130, flexShrink: 0 }}>
              <SmallLabel>Role</SmallLabel>
              <Select value={inviteRole} onValueChange={setInviteRole} options={ROLE_OPTIONS} />
            </div>
            <button
              type="submit"
              disabled={inviteBusy}
              style={{
                ...accentBtnStyle,
                padding: '0 16px',
                height: 'var(--xp-input-h)',
                fontSize: 12,
                opacity: inviteBusy ? 0.6 : 1,
                cursor: inviteBusy ? 'wait' : 'pointer',
              }}
            >
              {inviteBusy ? 'Sending...' : 'Send invite'}
            </button>
          </form>
          {inviteMsg && (
            <p
              style={{
                fontSize: 11,
                marginTop: -8,
                marginBottom: 24,
                fontFamily: 'var(--xp-font-mono)',
                color: inviteMsg === 'Invite sent' ? 'var(--xp-success)' : 'var(--xp-danger)',
              }}
            >
              {inviteMsg}
            </p>
          )}

          {pendingInvites.length > 0 && (
            <>
              <Label>Pending invites ({pendingInvites.length})</Label>
              <table
                style={{
                  width: '100%',
                  fontSize: 11.5,
                  borderCollapse: 'collapse',
                  marginBottom: 16,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--xp-hairline)', textAlign: 'left' }}>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Invited by</th>
                    <th style={thStyle}>Sent</th>
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--xp-hairline)' }}>
                      <td style={tdStyle}>{inv.email}</td>
                      <td style={tdStyle}>
                        <span
                          title={`Invited as ${inv.role}`}
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            fontSize: 10,
                            fontWeight: 600,
                            borderRadius: 'var(--xp-r-sm)',
                            background: 'var(--xp-surface)',
                            color: 'var(--xp-ink)',
                            border: '1px solid var(--xp-border)',
                          }}
                        >
                          {inv.role}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--xp-muted)' }}>
                        {inv.invitedByName ?? inv.invitedByEmail}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--xp-muted)' }}>
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => handleResendInvite(inv)}
                            style={{ ...inviteActionBtnStyle, color: 'var(--xp-accent-strong)' }}
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inv)}
                            style={{ ...inviteActionBtnStyle, color: 'var(--xp-danger)' }}
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <SectionDivider />
          <Label>Add agent</Label>
          <p style={sectionHintStyle}>
            Agents are teammates backed by a coding harness. Add one here, then connect its harness
            so it can pick up issues, comment, and update status like any member.
          </p>
          <form onSubmit={handleAddAgent} style={formCardStyle}>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <SmallLabel>Agent name</SmallLabel>
              <FieldInput
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. Claude Bot"
                required
              />
            </div>
            <div style={{ width: 130, flexShrink: 0 }}>
              <SmallLabel>Harness</SmallLabel>
              <Select
                value={agentHarness}
                onValueChange={setAgentHarness}
                options={HARNESS_OPTIONS}
              />
            </div>
            <button
              type="submit"
              disabled={addBusy}
              style={{
                ...accentBtnStyle,
                padding: '0 16px',
                height: 'var(--xp-input-h)',
                fontSize: 12,
                opacity: addBusy ? 0.6 : 1,
                cursor: addBusy ? 'wait' : 'pointer',
              }}
            >
              {addBusy ? 'Adding...' : 'Add agent'}
            </button>
          </form>
          {agentMsg && (
            <p
              style={{
                fontSize: 11,
                marginTop: -8,
                marginBottom: 16,
                fontFamily: 'var(--xp-font-mono)',
                color: agentMsg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)',
              }}
            >
              {agentMsg}
            </p>
          )}

          <ConnectHarnessGuide />
        </>
      )}

      {keyReveal && (
        <ConnectKeyModal
          name={keyReveal.name}
          apiKey={keyReveal.key}
          harness={keyReveal.harness}
          onClose={() => setKeyReveal(null)}
        />
      )}

      {editing && (
        <EditAgentModal
          agent={editing}
          token={token}
          onUpdate={applyAgentUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// Edit an existing agent: rename, switch its harness, or set a custom avatar.
// Avatar upload/remove takes effect immediately (it must hit the server for a
// URL); name + harness are saved together on "Save changes".
function EditAgentModal({
  agent,
  token,
  onUpdate,
  onClose,
}: {
  agent: WorkspaceUser;
  token: string | null;
  onUpdate: (u: WorkspaceUser) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(agent.displayName ?? '');
  const [harness, setHarness] = useState(agent.agentHarness ?? 'claude_code');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(agent.avatarUrl ?? null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setErr(null);
    try {
      const { user } = await api.updateAgentAvatar(agent.id, file, token);
      setAvatarUrl(user.avatarUrl ?? null);
      onUpdate(user);
    } catch (e) {
      setErr(e instanceof FetchError ? e.message : 'Failed to upload avatar');
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true);
    setErr(null);
    try {
      const { user } = await api.updateAgent(agent.id, { avatarUrl: null }, token);
      setAvatarUrl(null);
      onUpdate(user);
    } catch (e) {
      setErr(e instanceof FetchError ? e.message : 'Failed to remove avatar');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaveBusy(true);
    setErr(null);
    try {
      const { user } = await api.updateAgent(agent.id, { displayName: trimmed, harness }, token);
      onUpdate(user);
      onClose();
    } catch (e) {
      setErr(e instanceof FetchError ? e.message : 'Failed to save');
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <dialog
      open
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
        border: 0,
      }}
    >
      <form
        onSubmit={handleSave}
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--xp-canvas)',
          border: '1px solid var(--xp-border)',
          borderRadius: 'var(--xp-r-md, 10px)',
          padding: 24,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--xp-ink)', marginBottom: 16 }}>
          Edit agent
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
          <AgentAvatar
            name={name || agent.email}
            size={48}
            src={avatarUrl ?? undefined}
            isAgent
            harness={harness}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFile}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                style={{ ...inviteActionBtnStyle, color: 'var(--xp-accent-strong)' }}
              >
                {avatarBusy ? 'Uploading…' : avatarUrl ? 'Replace image' : 'Upload image'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={avatarBusy}
                  style={{ ...inviteActionBtnStyle, color: 'var(--xp-danger)' }}
                >
                  Remove
                </button>
              )}
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--xp-faint)' }}>
              {avatarUrl
                ? 'Custom image shown instead of the harness badge.'
                : 'Defaults to the harness badge.'}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <SmallLabel>Agent name</SmallLabel>
          <FieldInput value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div style={{ marginBottom: 18 }}>
          <SmallLabel>Harness</SmallLabel>
          <Select value={harness} onValueChange={setHarness} options={HARNESS_OPTIONS} />
        </div>

        {err && (
          <p
            style={{
              fontSize: 11,
              fontFamily: 'var(--xp-font-mono)',
              color: 'var(--xp-danger)',
              margin: '0 0 12px',
            }}
          >
            {err}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...inviteActionBtnStyle, color: 'var(--xp-muted)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveBusy}
            style={{
              ...accentBtnStyle,
              padding: '0 16px',
              height: 'var(--xp-input-h)',
              fontSize: 12,
              opacity: saveBusy ? 0.6 : 1,
              cursor: saveBusy ? 'wait' : 'pointer',
            }}
          >
            {saveBusy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Copy-once reveal for a freshly generated, agent-bound connection key, with the
// exact command to wire the harness up over MCP. The key authenticates AS the
// agent, so its board activity is attributed to the agent — not the creator.
function ConnectKeyModal({
  name,
  apiKey,
  harness,
  onClose,
}: {
  name: string;
  apiKey: string;
  harness: string | null;
  onClose: () => void;
}) {
  const guide = harnessConnectionGuide(harness, apiKey);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
  };
  return (
    <dialog
      open
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
        border: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--xp-canvas)',
          border: '1px solid var(--xp-border)',
          borderRadius: 'var(--xp-r-md, 10px)',
          padding: 24,
          fontFamily: 'var(--xp-font-mono)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--xp-ink)', marginBottom: 4 }}>
          Connect {name}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--xp-muted)', margin: '0 0 16px' }}>
          Copy this key now — it’s shown <strong>once</strong>. It authenticates the harness{' '}
          <em>as {name}</em>, so its comments and changes on the board are attributed to the agent.
        </p>

        <SmallLabel>Harness key</SmallLabel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <code
            style={{
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              padding: '8px 10px',
              fontSize: 11,
              background: 'var(--xp-surface)',
              border: '1px solid var(--xp-hairline)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
            }}
          >
            {apiKey}
          </code>
          <button
            type="button"
            onClick={() => copy(apiKey)}
            style={{
              ...accentBtnStyle,
              padding: '0 12px',
              height: 32,
              fontSize: 11,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            Copy
          </button>
        </div>

        <SmallLabel>Wire it up ({guide.label})</SmallLabel>
        <pre
          style={{
            margin: '0 0 8px',
            padding: '10px 12px',
            background: 'var(--xp-surface)',
            border: '1px solid var(--xp-hairline)',
            borderRadius: 'var(--xp-r-sm)',
            fontSize: 11,
            color: 'var(--xp-ink)',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {guide.command}
        </pre>
        {guide.note && (
          <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--xp-muted)', margin: '0 0 8px' }}>
            {guide.note}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => copy(guide.command)}
            style={{ ...linkBtnStyle, color: 'var(--xp-accent-strong)' }}
          >
            {guide.copyLabel ?? 'Copy command'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...accentBtnStyle,
              padding: '0 16px',
              height: 'var(--xp-input-h)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}

// Inline, accurate walkthrough for wiring a coding harness up to xpntl over MCP.
function ConnectHarnessGuide() {
  const [exampleHarness, setExampleHarness] = useState('claude_code');
  const guide = harnessPlaceholderGuide(exampleHarness);
  const steps = [
    {
      id: 'reserve',
      content:
        'Add the agent above and pick its harness — this reserves its identity on the roster.',
    },
    {
      id: 'key',
      content: (
        <span>
          Click <strong>Connect</strong> on the agent’s row above to generate a key bound to it
          (shown only once). The key authenticates <em>as that agent</em>, so its activity is
          attributed to the agent — not to you.
        </span>
      ),
    },
    {
      id: 'mcp',
      content: 'Point the harness at the xpntl MCP endpoint using that key:',
    },
    {
      id: 'online',
      content: 'The agent comes online here and can be assigned issues like any teammate.',
    },
  ];
  return (
    <div
      style={{
        maxWidth: 620,
        marginTop: 4,
        padding: '14px 16px',
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: 'var(--xp-faint)',
          marginBottom: 10,
        }}
      >
        CONNECT A HARNESS
      </div>
      <div style={{ maxWidth: 160, marginBottom: 12 }}>
        <SmallLabel>Example</SmallLabel>
        <Select
          value={exampleHarness}
          onValueChange={setExampleHarness}
          options={HARNESS_OPTIONS}
        />
      </div>
      <ol
        style={{
          margin: 0,
          paddingLeft: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {steps.map((step, i) => (
          <li
            key={step.id}
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--xp-ink)',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--xp-accent)',
                color: 'var(--xp-accent-fg)',
                fontSize: 10,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <div style={{ flex: 1 }}>
              {step.content}
              {step.id === 'mcp' && (
                <pre
                  style={{
                    margin: '8px 0 0',
                    padding: '10px 12px',
                    background: 'var(--xp-canvas)',
                    border: '1px solid var(--xp-hairline)',
                    borderRadius: 'var(--xp-r-sm)',
                    fontSize: 11,
                    fontFamily: 'var(--xp-font-mono)',
                    color: 'var(--xp-ink)',
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                  }}
                >
                  {guide.command}
                </pre>
              )}
              {step.id === 'mcp' && guide.note && (
                <p style={{ margin: '6px 0 0', color: 'var(--xp-muted)' }}>{guide.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--xp-ink)' }}>
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div style={{ height: 1, background: 'var(--xp-hairline)', margin: '28px 0 20px' }} />;
}

const sectionHintStyle: React.CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: 'var(--xp-muted)',
  margin: '0 0 12px',
  maxWidth: 560,
};

const formCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-end',
  maxWidth: 560,
  marginBottom: 16,
  padding: '12px 14px',
  background: 'var(--xp-surface)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
};

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, marginBottom: 4, color: 'var(--xp-faint)' }}>
      {children}
    </div>
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

const thStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontWeight: 600,
  fontSize: 10.5,
  color: 'var(--xp-faint)',
  letterSpacing: '0.04em',
};
const tdStyle: React.CSSProperties = { padding: '6px 8px' };
const accentBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-accent)',
  color: 'var(--xp-accent-fg)',
  border: 'none',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--xp-danger)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  padding: 0,
  textDecoration: 'underline',
};
const inviteActionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  padding: 0,
  textDecoration: 'underline',
};

// XP-11: derive online/idle/offline from last-active time. For agents this
// reads as working/idle/offline; for humans, online/away/offline.
function presenceStatus(lastSeenAt?: string | null): { label: string; color: string } {
  if (!lastSeenAt) return { label: 'Offline', color: 'var(--xp-faint)' };
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  if (ageMs < 2 * 60 * 1000) return { label: 'Online', color: 'oklch(70% 0.17 145)' };
  if (ageMs < 15 * 60 * 1000) return { label: 'Idle', color: 'oklch(75% 0.14 80)' };
  return { label: 'Offline', color: 'var(--xp-faint)' };
}

function PresenceDot({ lastSeenAt, isAgent }: { lastSeenAt?: string | null; isAgent?: boolean }) {
  const { label, color } = presenceStatus(lastSeenAt);
  const rel = lastSeenAt ? formatRelative(lastSeenAt) : 'never';
  return (
    <span
      title={`${isAgent ? 'Agent' : 'Member'} · ${label} (last active ${rel})`}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        // Subtle ring so the dot reads on any row background.
        boxShadow: '0 0 0 1.5px var(--xp-surface)',
      }}
    />
  );
}
