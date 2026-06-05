import { Spinner } from '@xpntl/ui';
import { useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const AVAILABLE_SCOPES = [
  { value: 'issues:read', label: 'Issues (read)' },
  { value: 'issues:write', label: 'Issues (write)' },
  { value: 'comments:read', label: 'Comments (read)' },
  { value: 'comments:write', label: 'Comments (write)' },
  { value: 'projects:read', label: 'Projects (read)' },
  { value: 'projects:write', label: 'Projects (write)' },
  { value: 'labels:read', label: 'Labels (read)' },
  { value: 'labels:write', label: 'Labels (write)' },
  { value: 'teams:read', label: 'Teams (read)' },
  { value: 'users:read', label: 'Users (read)' },
];

export function SettingsApiKeysPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>API Keys</h1>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 24 }}>
        Create API keys to access the xpntl REST API programmatically. Keys are scoped to your workspace.
      </p>
      <ApiKeysSection />
    </SettingsLayout>
  );
}

function ApiKeysSection() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    api.listApiKeys(token).then((r) => {
      setKeys(r.keys);
      setLoading(false);
    });
  }, [token]);

  async function handleCreate() {
    if (selectedScopes.length === 0) return;
    const name = newKeyName.trim() || 'Default';
    setCreating(true);
    try {
      const { key, record } = await api.createApiKey({ name, scopes: selectedScopes }, token);
      setKeys((prev) => [record, ...prev]);
      setRevealedKey(key);
      setNewKeyName('');
      setSelectedScopes([]);
      setShowCreate(false);
    } catch (err) {
      alert(err instanceof FetchError ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? Any integrations using it will stop working.')) return;
    try {
      await api.revokeApiKey(id, token);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      alert(err instanceof FetchError ? err.message : 'Failed to revoke key');
    }
  }

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  return (
    <div>
      {revealedKey && (
        <div
          style={{
            background: 'var(--xp-accent-tint, #f0f4ff)',
            border: '1px solid var(--xp-accent-strong)',
            borderRadius: 'var(--xp-r-sm)',
            padding: 12,
            marginBottom: 16,
            fontSize: 11,
            fontFamily: 'var(--xp-font-mono)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--xp-danger, #e53e3e)' }}>
            Copy your API key now -- it will not be shown again!
          </div>
          <code
            style={{
              display: 'block',
              padding: 8,
              background: 'var(--xp-canvas)',
              borderRadius: 'var(--xp-r-sm)',
              wordBreak: 'break-all',
              cursor: 'pointer',
            }}
            onClick={() => {
              navigator.clipboard?.writeText(revealedKey);
            }}
            title="Click to copy"
          >
            {revealedKey}
          </code>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(revealedKey);
              }}
              style={{
                background: 'var(--xp-accent)',
                border: '1px solid transparent',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-accent-fg)',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'var(--xp-font-mono)',
                fontWeight: 600,
                padding: '4px 10px',
              }}
            >
              Copy to clipboard
            </button>
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--xp-muted)',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'var(--xp-font-mono)',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!showCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            background: 'var(--xp-accent)',
            border: '1px solid transparent',
            borderRadius: 'var(--xp-r-sm)',
            color: 'var(--xp-accent-fg)',
            cursor: 'pointer',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11,
            fontWeight: 600,
            padding: '6px 14px',
            marginBottom: 16,
          }}
        >
          Create API Key
        </button>
      ) : (
        <div
          style={{
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-md, 8px)',
            padding: 16,
            marginBottom: 16,
            background: 'var(--xp-surface)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New API Key</div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontFamily: 'var(--xp-font-mono)',
                color: 'var(--xp-muted)',
                marginBottom: 4,
              }}
            >
              Name
            </label>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. CI Pipeline"
              style={{
                width: '100%',
                maxWidth: 320,
                padding: '6px 10px',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                background: 'var(--xp-canvas)',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 12,
                color: 'var(--xp-ink)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontFamily: 'var(--xp-font-mono)',
                color: 'var(--xp-muted)',
                marginBottom: 8,
              }}
            >
              Scopes
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 6,
              }}
            >
              {AVAILABLE_SCOPES.map((scope) => (
                <label
                  key={scope.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontFamily: 'var(--xp-font-mono)',
                    color: 'var(--xp-ink)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    style={{ accentColor: 'var(--xp-accent-strong)' }}
                  />
                  {scope.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={creating || selectedScopes.length === 0}
              onClick={handleCreate}
              style={{
                background: 'var(--xp-accent)',
                border: '1px solid transparent',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-accent-fg)',
                cursor: creating || selectedScopes.length === 0 ? 'default' : 'pointer',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 14px',
                opacity: creating || selectedScopes.length === 0 ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewKeyName('');
                setSelectedScopes([]);
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                padding: '6px 14px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading…" />
      ) : keys.length === 0 ? (
        <div className="xp-muted" style={{ fontSize: 12, fontFamily: 'var(--xp-font-mono)' }}>
          No active API keys. Create one to get started.
        </div>
      ) : (
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
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>NAME</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>PREFIX</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>SCOPES</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>LAST USED</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>CREATED</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ borderBottom: '1px solid var(--xp-hairline)' }}>
                <td style={{ padding: '6px 8px' }}>{k.name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>{k.prefix}...</td>
                <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                  {k.scopes.length > 2
                    ? `${k.scopes.slice(0, 2).join(', ')} +${k.scopes.length - 2}`
                    : k.scopes.join(', ')}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--xp-danger, #e53e3e)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--xp-font-mono)',
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
