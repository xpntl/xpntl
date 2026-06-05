import { type FormEvent, useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

type GitHubIntegration = {
  id: string;
  owner: string;
  repo: string;
  active: boolean;
  webhookSecret: string;
  createdAt: string;
};

export function SettingsGitHubPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>GitHub Integration</h1>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 24 }}>
        Connect GitHub repositories to sync issues, pull requests, and commits with your xpntl workspace.
      </p>
      <GitHubSection />
    </SettingsLayout>
  );
}

function GitHubSection() {
  const { token } = useAuth();
  const [integrations, setIntegrations] = useState<GitHubIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api.listGitHubIntegrations(token).then((r) => {
      setIntegrations(r.integrations);
      setLoading(false);
    });
  }, [token]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmedOwner = owner.trim();
    const trimmedRepo = repo.trim();
    if (!trimmedOwner || !trimmedRepo) return;
    setCreating(true);
    setMsg(null);
    try {
      const result = await api.createGitHubIntegration({ owner: trimmedOwner, repo: trimmedRepo }, token);
      setIntegrations((prev) => [result.integration ?? result, ...prev]);
      setOwner('');
      setRepo('');
      setShowCreate(false);
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to connect repository');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this GitHub integration? Webhook events will no longer be processed.')) return;
    setMsg(null);
    try {
      await api.deleteGitHubIntegration(id, token);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to remove integration');
    }
  }

  function handleCopySecret(id: string, secret: string) {
    navigator.clipboard?.writeText(secret);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {msg && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--xp-danger, #e53e3e)',
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
          Connect Repository
        </button>
      ) : (
        <form
          onSubmit={handleCreate}
          style={{
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-md, 8px)',
            padding: 16,
            marginBottom: 16,
            background: 'var(--xp-surface)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Connect Repository</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontFamily: 'var(--xp-font-mono)',
                  color: 'var(--xp-muted)',
                  marginBottom: 4,
                }}
              >
                Owner
              </label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. my-org"
                autoFocus
                style={{
                  width: '100%',
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
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontFamily: 'var(--xp-font-mono)',
                  color: 'var(--xp-muted)',
                  marginBottom: 4,
                }}
              >
                Repository
              </label>
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="e.g. my-repo"
                style={{
                  width: '100%',
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
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={creating || !owner.trim() || !repo.trim()}
              style={{
                background: 'var(--xp-accent)',
                border: '1px solid transparent',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-accent-fg)',
                cursor: creating || !owner.trim() || !repo.trim() ? 'default' : 'pointer',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 14px',
                opacity: creating || !owner.trim() || !repo.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Connecting...' : 'Connect'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setOwner('');
                setRepo('');
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
        </form>
      )}

      {loading ? (
        <div className="xp-muted" style={{ fontSize: 12 }}>Loading...</div>
      ) : integrations.length === 0 ? (
        <div className="xp-muted" style={{ fontSize: 12, fontFamily: 'var(--xp-font-mono)' }}>
          No repositories connected. Connect one to get started.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            overflow: 'hidden',
          }}
        >
          {integrations.map((integration, i) => (
            <div
              key={integration.id}
              style={{
                padding: '12px 14px',
                borderBottom: i < integrations.length - 1 ? '1px solid var(--xp-hairline)' : 'none',
                background: 'var(--xp-surface)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'var(--xp-font-mono)',
                      color: 'var(--xp-ink)',
                    }}
                  >
                    {integration.owner}/{integration.repo}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--xp-font-mono)',
                      padding: '2px 6px',
                      borderRadius: 'var(--xp-r-sm)',
                      background: integration.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: integration.active ? '#22c55e' : '#ef4444',
                      fontWeight: 600,
                    }}
                  >
                    {integration.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(integration.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--xp-danger, #e53e3e)',
                    cursor: 'pointer',
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 11,
                    padding: '2px 4px',
                    textDecoration: 'underline',
                    flexShrink: 0,
                  }}
                >
                  Delete
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--xp-font-mono)',
                    color: 'var(--xp-muted)',
                    flexShrink: 0,
                  }}
                >
                  Webhook secret:
                </span>
                <code
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--xp-font-mono)',
                    color: 'var(--xp-ink)',
                    background: 'var(--xp-canvas)',
                    padding: '2px 6px',
                    borderRadius: 'var(--xp-r-sm)',
                    border: '1px solid var(--xp-border)',
                    wordBreak: 'break-all',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {integration.webhookSecret}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopySecret(integration.id, integration.webhookSecret)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--xp-border)',
                    borderRadius: 'var(--xp-r-sm)',
                    color: copiedId === integration.id ? 'var(--xp-accent)' : 'var(--xp-muted)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontFamily: 'var(--xp-font-mono)',
                    padding: '2px 8px',
                    flexShrink: 0,
                  }}
                >
                  {copiedId === integration.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--xp-font-mono)',
                  color: 'var(--xp-muted)',
                  marginTop: 4,
                }}
              >
                Connected {new Date(integration.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          padding: 14,
          background: 'var(--xp-surface)',
          border: '1px solid var(--xp-border)',
          borderRadius: 'var(--xp-r-md, 8px)',
          fontSize: 11,
          fontFamily: 'var(--xp-font-mono)',
          color: 'var(--xp-muted)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--xp-ink)', marginBottom: 8, fontSize: 12 }}>
          Webhook Setup
        </div>
        <p style={{ margin: '0 0 8px' }}>
          After connecting a repository, add a webhook in your GitHub repo settings:
        </p>
        <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>
          <li style={{ marginBottom: 4 }}>
            Go to your repo on GitHub &rarr; Settings &rarr; Webhooks &rarr; Add webhook
          </li>
          <li style={{ marginBottom: 4 }}>
            Set the Payload URL to:{' '}
            <code
              style={{
                background: 'var(--xp-canvas)',
                padding: '1px 4px',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-accent)',
              }}
            >
              https://api.xpntl.dev/v1/github/webhook
            </code>
          </li>
          <li style={{ marginBottom: 4 }}>
            Set Content type to <strong>application/json</strong>
          </li>
          <li style={{ marginBottom: 4 }}>
            Paste the webhook secret shown above into the Secret field
          </li>
          <li>
            Select the events you want to receive (recommended: push, pull requests, issues)
          </li>
        </ol>
      </div>
    </div>
  );
}
