import { useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

type WebhookRecord = {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  active: boolean;
  createdAt: string;
};

const AVAILABLE_EVENTS = [
  { value: 'issue.created', label: 'Issue created' },
  { value: 'issue.updated', label: 'Issue updated' },
  { value: 'issue.deleted', label: 'Issue deleted' },
  { value: 'comment.created', label: 'Comment created' },
  { value: 'comment.updated', label: 'Comment updated' },
  { value: 'comment.deleted', label: 'Comment deleted' },
  { value: 'project.created', label: 'Project created' },
  { value: 'project.updated', label: 'Project updated' },
  { value: 'label.created', label: 'Label created' },
  { value: 'label.updated', label: 'Label updated' },
  { value: 'user.invited', label: 'User invited' },
  { value: 'user.removed', label: 'User removed' },
];

export function SettingsWebhooksPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Webhooks</h1>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 24 }}>
        Configure outbound webhooks to notify external services when events occur in your workspace.
      </p>
      <WebhooksSection />
    </SettingsLayout>
  );
}

function WebhooksSection() {
  const { token } = useAuth();
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listWebhooks(token).then((r) => {
      setWebhooks(r.webhooks);
      setLoading(false);
    });
  }, [token]);

  async function handleCreate() {
    if (selectedEvents.length === 0 || !newUrl.trim()) return;
    setCreating(true);
    try {
      const webhook = await api.createWebhook(
        { url: newUrl.trim(), events: selectedEvents, description: newDescription.trim() || undefined },
        token,
      );
      setWebhooks((prev) => [webhook, ...prev]);
      setNewUrl('');
      setNewDescription('');
      setSelectedEvents([]);
      setShowCreate(false);
    } catch (err) {
      alert(err instanceof FetchError ? err.message : 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await api.updateWebhook(id, { active }, token);
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, active } : w)));
    } catch (err) {
      alert(err instanceof FetchError ? err.message : 'Failed to update webhook');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this webhook? It will stop receiving events immediately.')) return;
    try {
      await api.deleteWebhook(id, token);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      alert(err instanceof FetchError ? err.message : 'Failed to delete webhook');
    }
  }

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  return (
    <div>
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
          Create Webhook
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
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Webhook</div>
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
              URL
            </label>
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              style={{
                width: '100%',
                maxWidth: 480,
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
                marginBottom: 4,
              }}
            >
              Description
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional description for this webhook"
              rows={2}
              style={{
                width: '100%',
                maxWidth: 480,
                padding: '6px 10px',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                background: 'var(--xp-canvas)',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 12,
                color: 'var(--xp-ink)',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
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
              Events
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 6,
              }}
            >
              {AVAILABLE_EVENTS.map((event) => (
                <label
                  key={event.value}
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
                    checked={selectedEvents.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    style={{ accentColor: 'var(--xp-accent-strong)' }}
                  />
                  {event.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={creating || selectedEvents.length === 0 || !newUrl.trim()}
              onClick={handleCreate}
              style={{
                background: 'var(--xp-accent)',
                border: '1px solid transparent',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-accent-fg)',
                cursor: creating || selectedEvents.length === 0 || !newUrl.trim() ? 'default' : 'pointer',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 14px',
                opacity: creating || selectedEvents.length === 0 || !newUrl.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewUrl('');
                setNewDescription('');
                setSelectedEvents([]);
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
        <div className="xp-muted" style={{ fontSize: 12 }}>Loading...</div>
      ) : webhooks.length === 0 ? (
        <div className="xp-muted" style={{ fontSize: 12, fontFamily: 'var(--xp-font-mono)' }}>
          No webhooks configured. Create one to start receiving event notifications.
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
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>URL</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>EVENTS</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>STATUS</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>CREATED</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id} style={{ borderBottom: '1px solid var(--xp-hairline)' }}>
                <td style={{ padding: '6px 8px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.url}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                  {w.events.length > 2
                    ? `${w.events.slice(0, 2).join(', ')} +${w.events.length - 2}`
                    : w.events.join(', ')}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(w.id, !w.active)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--xp-font-mono)',
                      fontWeight: 600,
                      color: w.active ? 'var(--xp-success, #38a169)' : 'var(--xp-muted)',
                      padding: 0,
                    }}
                  >
                    {w.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--xp-muted)' }}>
                  {new Date(w.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '6px 8px', display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(w.id, !w.active)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--xp-muted)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--xp-font-mono)',
                    }}
                  >
                    {w.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(w.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--xp-danger, #e53e3e)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--xp-font-mono)',
                    }}
                  >
                    Delete
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
