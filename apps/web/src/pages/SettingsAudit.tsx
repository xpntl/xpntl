import { Spinner } from '@xpntl/ui';
import { useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { type AuditLogEntry, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function SettingsAuditPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Audit Log</h1>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 24 }}>
        View a chronological record of actions taken across your workspace.
      </p>
      <AuditLogSection />
    </SettingsLayout>
  );
}

function AuditLogSection() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  const PAGE_SIZE = 50;

  async function load(opts: { eventType?: string; targetType?: string; cursor?: string; append?: boolean }) {
    setLoading(true);
    try {
      const result = await api.listAuditLog(
        {
          eventType: opts.eventType || undefined,
          targetType: opts.targetType || undefined,
          cursor: opts.cursor,
          limit: PAGE_SIZE,
        },
        token,
      );
      if (opts.append) {
        setEntries((prev) => [...prev, ...result.entries]);
      } else {
        setEntries(result.entries);
      }
      setHasMore(result.entries.length === PAGE_SIZE);
      if (result.entries.length > 0) {
        setCursor(result.entries[result.entries.length - 1]!.createdAt);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ eventType: eventTypeFilter, targetType: targetTypeFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eventTypeFilter, targetTypeFilter]);

  function handleLoadMore() {
    load({ eventType: eventTypeFilter, targetType: targetTypeFilter, cursor, append: true });
  }

  // Derive unique event types and target types from loaded data for filter dropdowns.
  const eventTypes = [...new Set(entries.map((e) => e.eventType))].sort();
  const targetTypes = [...new Set(entries.map((e) => e.targetType).filter(Boolean))].sort();

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontFamily: 'var(--xp-font-mono)',
              color: 'var(--xp-muted)',
              marginBottom: 4,
            }}
          >
            Event Type
          </label>
          <select
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value);
              setCursor(undefined);
            }}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              background: 'var(--xp-canvas)',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
              color: 'var(--xp-ink)',
              outline: 'none',
            }}
          >
            <option value="">All</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontFamily: 'var(--xp-font-mono)',
              color: 'var(--xp-muted)',
              marginBottom: 4,
            }}
          >
            Target Type
          </label>
          <select
            value={targetTypeFilter}
            onChange={(e) => {
              setTargetTypeFilter(e.target.value);
              setCursor(undefined);
            }}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              background: 'var(--xp-canvas)',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
              color: 'var(--xp-ink)',
              outline: 'none',
            }}
          >
            <option value="">All</option>
            {targetTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading && entries.length === 0 ? (
        <Spinner label="Loading…" />
      ) : entries.length === 0 ? (
        <div className="xp-muted" style={{ fontSize: 12, fontFamily: 'var(--xp-font-mono)' }}>
          No audit log entries found.
        </div>
      ) : (
        <>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 11,
              fontFamily: 'var(--xp-font-mono)',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--xp-hairline)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>TIMESTAMP</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>EVENT</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>ACTOR</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>TARGET</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>METADATA</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid var(--xp-hairline)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--xp-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 'var(--xp-r-sm)',
                        background: 'var(--xp-layer)',
                        fontSize: 10,
                      }}
                    >
                      {entry.eventType}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                    {entry.actorUserId ? entry.actorUserId.slice(0, 8) + '...' : '--'}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                    {entry.targetType ? (
                      <span>
                        {entry.targetType}
                        {entry.targetId ? ` / ${entry.targetId.slice(0, 8)}...` : ''}
                      </span>
                    ) : (
                      '--'
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--xp-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.metadata && Object.keys(entry.metadata).length > 0
                      ? JSON.stringify(entry.metadata)
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                type="button"
                disabled={loading}
                onClick={handleLoadMore}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--xp-border)',
                  borderRadius: 'var(--xp-r-sm)',
                  color: 'var(--xp-ink)',
                  cursor: loading ? 'default' : 'pointer',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 11,
                  padding: '6px 14px',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
