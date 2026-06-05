import { Spinner } from '@xpntl/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

interface NotificationPrefs {
  mention: boolean;
  assigned: boolean;
  stateChange: boolean;
  comment: boolean;
  dueSoon: boolean;
  emailDigest: 'none' | 'daily' | 'weekly';
}

const defaultPrefs: NotificationPrefs = {
  mention: true,
  assigned: true,
  stateChange: false,
  comment: true,
  dueSoon: false,
  emailDigest: 'none',
};

const toggleItems: { key: keyof Omit<NotificationPrefs, 'emailDigest'>; label: string }[] = [
  { key: 'mention', label: 'Mentions' },
  { key: 'assigned', label: 'Assigned to issue' },
  { key: 'stateChange', label: 'State changes' },
  { key: 'comment', label: 'Comments' },
  { key: 'dueSoon', label: 'Due soon reminders' },
];

const digestOptions: { value: NotificationPrefs['emailDigest']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function SettingsNotificationsPage() {
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getNotificationPreferences(token)
      .then((r) => setPrefs({ ...r, emailDigest: r.emailDigest as NotificationPrefs['emailDigest'] }))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.updateNotificationPreferences(prefs, token);
      setMsg('Preferences saved');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to save preferences');
    } finally {
      setBusy(false);
    }
  }

  function togglePref(key: keyof Omit<NotificationPrefs, 'emailDigest'>) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  if (loading) {
    return (
      <SettingsLayout>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Notifications</h1>
        <Spinner label="Loading…" />
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Notifications</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
        <SectionTitle>Notification Types</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {toggleItems.map(({ key, label }) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: 'var(--xp-surface)',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 12.5, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-ink)' }}>
                {label}
              </span>
              <ToggleSwitch checked={prefs[key]} onChange={() => togglePref(key)} />
            </label>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />

        <SectionTitle>Email Digest</SectionTitle>
        <div style={{ fontSize: 10.5, color: 'var(--xp-faint)', marginBottom: 8 }}>
          Receive a summary of unread notifications via email.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {digestOptions.map(({ value, label }) => (
            <label
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 12.5,
                fontFamily: 'var(--xp-font-mono)',
                color: 'var(--xp-ink)',
              }}
            >
              <input
                type="radio"
                name="emailDigest"
                checked={prefs.emailDigest === value}
                onChange={() => setPrefs((p) => ({ ...p, emailDigest: value }))}
                style={{ accentColor: 'var(--xp-accent)' }}
              />
              {label}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
          <SaveButton busy={busy} />
          {msg && (
            <span
              style={{
                fontSize: 11,
                color: msg === 'Preferences saved' ? 'var(--xp-success)' : 'var(--xp-danger)',
              }}
            >
              {msg}
            </span>
          )}
        </div>
      </form>
    </SettingsLayout>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 10,
        border: '1px solid var(--xp-border)',
        background: checked ? 'var(--xp-accent)' : 'var(--xp-surface)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: checked ? 'var(--xp-accent-fg)' : 'var(--xp-muted)',
          transition: 'left 0.15s',
        }}
      />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--xp-ink)' }}>
      {children}
    </div>
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
