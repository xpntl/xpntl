import { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { type AgentActivityEntry, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function AgentActivityPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AgentActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    api
      .listAgentActivity({ limit: 50 }, token)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setHasMore(res.entries.length === 50);
        if (res.entries.length > 0) {
          setCursor(res.entries[res.entries.length - 1]!.createdAt);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  function loadMore() {
    if (!token || !cursor) return;
    api.listAgentActivity({ limit: 50, cursor }, token).then((res) => {
      setEntries((prev) => [...prev, ...res.entries]);
      setHasMore(res.entries.length === 50);
      if (res.entries.length > 0) {
        setCursor(res.entries[res.entries.length - 1]!.createdAt);
      }
    });
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 800 }}>
        <h1 style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 4 }}>
          Agent Activity
        </h1>
        <p style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-muted)', margin: 0, marginBottom: 20 }}>
          Chronological feed of actions performed by AI agents in your workspace.
        </p>

        {loading ? (
          <div style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-muted)', padding: '40px 0', textAlign: 'center' }}>
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div style={{
            fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-muted)',
            padding: '40px 0', textAlign: 'center',
            border: '1px solid var(--xp-border)', borderRadius: 'var(--xp-radius-sm)',
          }}>
            No agent activity yet. Actions performed by agent users will appear here.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {entries.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                style={{
                  display: 'block', margin: '16px auto 0', padding: '6px 16px',
                  fontFamily: 'var(--xp-font-mono)', fontSize: 11, fontWeight: 500,
                  background: 'var(--xp-layer)', border: '1px solid var(--xp-border)',
                  borderRadius: 'var(--xp-radius-sm)', cursor: 'pointer', color: 'var(--xp-ink)',
                }}
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

const HARNESS_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  custom: 'Custom',
};

function ActivityRow({ entry }: { entry: AgentActivityEntry }) {
  const time = new Date(entry.createdAt);
  const harnessLabel = entry.harness ? HARNESS_LABELS[entry.harness] ?? entry.harness : '';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 0', borderBottom: '1px solid var(--xp-hairline)',
        fontFamily: 'var(--xp-font-mono)', fontSize: 12,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: 'var(--xp-radius-sm)', flexShrink: 0,
        background: 'var(--xp-accent-strong)', color: 'var(--xp-canvas)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, overflow: 'hidden',
      }}>
        {entry.avatarUrl
          ? <img src={entry.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (entry.displayName?.[0] ?? 'A').toUpperCase()
        }
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontWeight: 600 }}>{entry.displayName ?? 'Agent'}</span>
          {harnessLabel && (
            <span style={{
              fontSize: 9.5, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: 'var(--xp-muted)', background: 'var(--xp-layer)',
              padding: '1px 5px', borderRadius: 'var(--xp-radius-xs)',
            }}>
              {harnessLabel}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--xp-faint)', whiteSpace: 'nowrap' }}>
            {time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div style={{ color: 'var(--xp-ink)' }}>
          <span style={{ fontWeight: 500 }}>{formatEventType(entry.eventType)}</span>
          {entry.targetType && (
            <span style={{ color: 'var(--xp-muted)' }}>
              {' '}{entry.targetType}{entry.targetId ? ` #${entry.targetId.slice(0, 8)}` : ''}
            </span>
          )}
        </div>
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--xp-muted)', marginTop: 2 }}>
            {Object.entries(entry.metadata).slice(0, 3).map(([k, v]) => (
              <span key={k} style={{ marginRight: 10 }}>
                {k}: {typeof v === 'string' ? v : JSON.stringify(v)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatEventType(eventType: string): string {
  return eventType.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
