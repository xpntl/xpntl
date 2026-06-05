import { useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, type SessionInfo, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function SettingsSessionsPage() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokeAllBusy, setRevokeAllBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .listSessions(token)
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e instanceof FetchError ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, [token]);

  async function revoke(id: string) {
    setBusyId(id);
    setRevokeMsg(null);
    try {
      await api.revokeSession(id, token);
      setSessions((s) => s.filter((x) => x.id !== id));
      setRevokeMsg('Session revoked');
    } catch (e) {
      setRevokeMsg(e instanceof FetchError ? e.message : 'Failed to revoke session');
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAll() {
    setRevokeAllBusy(true);
    setRevokeMsg(null);
    try {
      const { revoked } = await api.revokeAllSessions(token);
      setSessions((s) => s.filter((x) => x.isCurrent));
      setRevokeMsg(`Revoked ${revoked} session${revoked === 1 ? '' : 's'}`);
    } catch (e) {
      setRevokeMsg(e instanceof FetchError ? e.message : 'Failed to revoke sessions');
    } finally {
      setRevokeAllBusy(false);
    }
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <SettingsLayout>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Active Sessions</h1>
        {otherCount > 0 && (
          <button
            type="button"
            onClick={revokeAll}
            disabled={revokeAllBusy}
            style={dangerBtnStyle(revokeAllBusy)}
          >
            {revokeAllBusy ? 'Revoking…' : `Sign out all other devices (${otherCount})`}
          </button>
        )}
      </div>

      {revokeMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            fontSize: 12,
            borderRadius: 'var(--xp-r-sm)',
            background: revokeMsg.startsWith('Failed') ? 'var(--xp-danger-bg, #fff0f0)' : 'var(--xp-success-bg, #f0fff4)',
            color: revokeMsg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)',
            border: `1px solid ${revokeMsg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)'}`,
          }}
        >
          {revokeMsg}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--xp-faint)' }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 12, color: 'var(--xp-danger)' }}>{error}</div>
      ) : sessions.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--xp-faint)' }}>No active sessions found.</div>
      ) : (
        <div
          style={{
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              fontSize: 12,
              borderCollapse: 'collapse',
              fontFamily: 'var(--xp-font-mono)',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--xp-border)',
                  background: 'var(--xp-surface)',
                }}
              >
                <th style={thStyle}>Device / Browser</th>
                <th style={thStyle}>IP Address</th>
                <th style={thStyle}>Last Active</th>
                <th style={thStyle}>Created</th>
                <th style={{ ...thStyle, width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: '1px solid var(--xp-hairline)',
                    background: s.isCurrent ? 'var(--xp-layer)' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ color: 'var(--xp-ink)' }}>
                      {parseDevice(s.userAgent)}
                    </span>
                    {s.isCurrent && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '1px 6px',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          background: 'var(--xp-accent)',
                          color: 'var(--xp-accent-fg)',
                          borderRadius: 'var(--xp-r-sm)',
                          verticalAlign: 'middle',
                        }}
                      >
                        CURRENT
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--xp-muted)' }}>{s.ip ?? '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--xp-muted)' }}>
                    {formatDate(s.lastActiveAt)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--xp-muted)' }}>
                    {formatDate(s.createdAt)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => revoke(s.id)}
                        disabled={busyId === s.id}
                        style={revokeBtnStyle(busyId === s.id)}
                      >
                        {busyId === s.id ? '…' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 11, color: 'var(--xp-faint)' }}>
        Sessions expire after 30 days of inactivity. Revoking a session signs that device out
        immediately.
      </p>
    </SettingsLayout>
  );
}

function parseDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (userAgent === 'xpntl-cli') return 'xpntl CLI';
  // Extract browser name from user agent
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent) && !/Chrome/.test(userAgent)) return 'Safari';
  // Truncate if long
  return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: 10.5,
  color: 'var(--xp-faint)',
  letterSpacing: '0.05em',
  textAlign: 'left',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
};

function dangerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: 11.5,
    fontWeight: 600,
    fontFamily: 'var(--xp-font-mono)',
    background: 'none',
    color: disabled ? 'var(--xp-faint)' : 'var(--xp-danger)',
    border: `1px solid ${disabled ? 'var(--xp-border)' : 'var(--xp-danger)'}`,
    borderRadius: 'var(--xp-r-sm)',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function revokeBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--xp-font-mono)',
    background: 'none',
    color: disabled ? 'var(--xp-faint)' : 'var(--xp-danger)',
    border: `1px solid ${disabled ? 'var(--xp-border)' : 'var(--xp-danger)'}`,
    borderRadius: 'var(--xp-r-sm)',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
