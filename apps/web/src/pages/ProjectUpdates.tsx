// XP-21 Project Updates — a per-project status feed with a health signal.

import { Select } from '@xpntl/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { AgentAvatar } from '../components/AgentBadge';
import { type ProjectUpdate, type ProjectUpdateHealth, FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { confirm } from '../lib/confirm-store';
import { formatRelative } from '../lib/format';
import { DotIcon } from '../lib/select-options';
import { useProjectScope } from '../lib/use-project-scope';
import { useToasts } from '../lib/toast-store';
import { nameForUser, useUsers } from '../lib/user-store';

const HEALTH_META: Record<ProjectUpdateHealth, { label: string; color: string }> = {
  on_track: { label: 'On track', color: 'oklch(70% 0.17 145)' },
  at_risk: { label: 'At risk', color: 'oklch(75% 0.14 80)' },
  off_track: { label: 'Off track', color: 'var(--xp-danger)' },
};
const HEALTH_OPTIONS = (Object.keys(HEALTH_META) as ProjectUpdateHealth[]).map((k) => ({
  value: k,
  label: HEALTH_META[k].label,
  title: `Health: ${HEALTH_META[k].label}`,
  icon: <DotIcon color={HEALTH_META[k].color} />,
}));

export function ProjectUpdatesPage() {
  const { token, user } = useAuth();
  const { project, projectKey, projectId } = useProjectScope();
  const usersById = useUsers((s) => s.byId);
  const { push: pushToast } = useToasts();

  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [health, setHealth] = useState<ProjectUpdateHealth>('on_track');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .listProjectUpdates(projectId, token)
      .then((r) => setUpdates(r.updates))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, projectId]);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!projectId || !body.trim()) return;
    setBusy(true);
    try {
      const { update } = await api.createProjectUpdate({ projectId, body: body.trim(), health }, token);
      setUpdates((prev) => [update, ...prev]);
      setBody('');
      setHealth('on_track');
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to post update');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Delete update', message: 'Delete this project update?', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await api.deleteProjectUpdate(id, token);
      setUpdates((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to delete');
    }
  }

  if (!project) {
    return (
      <AppLayout>
        <div style={{ padding: '24px 32px', fontSize: 12, color: 'var(--xp-muted)' }}>
          {projectKey ? `Project "${projectKey}" not found.` : 'No project in scope.'}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ maxWidth: 720, padding: '24px 32px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{project.name} · Updates</h1>
        <p style={{ fontSize: 12, color: 'var(--xp-muted)', margin: '0 0 20px' }}>
          Post a status update so the team knows where the project stands.
        </p>

        <form
          onSubmit={handlePost}
          style={{
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-md)',
            background: 'var(--xp-surface)',
            padding: 14,
            marginBottom: 24,
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What changed? What's next? Any blockers?"
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 12.5,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-canvas)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <div style={{ width: 150 }}>
              <Select value={health} onValueChange={(v) => setHealth(v as ProjectUpdateHealth)} options={HEALTH_OPTIONS} />
            </div>
            <span style={{ flex: 1 }} />
            <button
              type="submit"
              disabled={busy || !body.trim()}
              style={{
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--xp-font-mono)',
                background: 'var(--xp-accent)',
                color: 'var(--xp-accent-fg)',
                border: 'none',
                borderRadius: 'var(--xp-r-sm)',
                cursor: busy || !body.trim() ? 'default' : 'pointer',
                opacity: busy || !body.trim() ? 0.6 : 1,
              }}
            >
              {busy ? 'Posting…' : 'Post update'}
            </button>
          </div>
        </form>

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--xp-faint)' }}>Loading…</div>
        ) : updates.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--xp-faint)' }}>No updates yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {updates.map((u) => {
              const meta = HEALTH_META[u.health] ?? HEALTH_META.on_track;
              return (
                <div
                  key={u.id}
                  style={{
                    border: '1px solid var(--xp-hairline)',
                    borderRadius: 'var(--xp-r-md)',
                    background: 'var(--xp-surface)',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: meta.color,
                      }}
                    >
                      <span title={`Health: ${meta.label}`} style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
                      {meta.label}
                    </span>
                    <span style={{ flex: 1 }} />
                    {u.createdBy && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>
                        <AgentAvatar
                          name={nameForUser(u.createdBy, usersById)}
                          src={usersById[u.createdBy]?.avatarUrl ?? undefined}
                          size={16}
                          isAgent={usersById[u.createdBy]?.isAgent}
                          harness={usersById[u.createdBy]?.agentHarness}
                        />
                        {nameForUser(u.createdBy, usersById)}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, color: 'var(--xp-faint)', fontFamily: 'var(--xp-font-mono)' }}>
                      {formatRelative(u.createdAt)}
                    </span>
                    {(u.createdBy === user?.id) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id)}
                        title="Delete update"
                        style={{ background: 'none', border: 0, color: 'var(--xp-faint)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {u.body}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
