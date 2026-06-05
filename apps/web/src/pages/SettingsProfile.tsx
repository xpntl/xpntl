import { Avatar } from '@xpntl/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useUsers } from '../lib/user-store';

export function SettingsProfilePage() {
  const { token } = useAuth();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    api.me(token).then((r) => setHasPassword(r.hasPassword ?? true));
  }, [token]);

  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Profile</h1>
      <ProfileForm />
      {hasPassword && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />
          <PasswordForm />
        </>
      )}
    </SettingsLayout>
  );
}

function ProfileForm() {
  const { user, token, setProfile, workspace } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const { avatarUrl: url } = await api.updateAvatar(file, token);
      setAvatarUrl(url);
      if (workspace && user) setProfile({ workspace, user: { ...user, avatarUrl: url } });
      // XP-95: keep the workspace-users cache fresh so creator/assignee/mention
      // labels reflect the change without a re-login.
      if (user) useUsers.getState().upsert(user.id, { avatarUrl: url });
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to upload avatar');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { user: updated } = await api.updateProfile({ displayName }, token);
      if (workspace) setProfile({ workspace, user: updated });
      // XP-95: refresh the cached label so the issue Creator (and assignee/
      // mentions) update immediately instead of after a re-login.
      useUsers.getState().upsert(updated.id, {
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl ?? null,
      });
      setMsg('Profile updated');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
      <SectionTitle>Avatar</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar
          name={user?.displayName || user?.email || '?'}
          size={64}
          src={avatarUrl ?? undefined}
        />
        <div>
          <button
            type="button"
            disabled={avatarBusy}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '5px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-surface)',
              color: 'var(--xp-ink)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              cursor: avatarBusy ? 'wait' : 'pointer',
              opacity: avatarBusy ? 0.6 : 1,
            }}
          >
            {avatarBusy ? 'Uploading…' : 'Change Avatar'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      <SectionTitle>Display Name</SectionTitle>
      <FieldInput
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Your name"
      />
      <div style={{ marginTop: 8 }}>
        <SectionTitle>Email</SectionTitle>
        <FieldInput value={user?.email ?? ''} disabled style={{ opacity: 0.5 }} />
        <div style={{ fontSize: 10.5, color: 'var(--xp-faint)', marginTop: 4 }}>
          Email change coming in a future release.
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <SectionTitle>Role</SectionTitle>
        <FieldInput value={user?.role ?? ''} disabled style={{ opacity: 0.5 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <SaveButton busy={busy} />
        {msg && (
          <span
            style={{
              fontSize: 11,
              color: msg.startsWith('Failed') ? 'var(--xp-danger)' : 'var(--xp-success)',
            }}
          >
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}

function PasswordForm() {
  const { token } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPw !== confirm) {
      setMsg('Passwords do not match');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.changePassword({ currentPassword: current, newPassword: newPw }, token);
      setMsg('Password changed');
      setCurrent('');
      setNewPw('');
      setConfirm('');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
      <SectionTitle>Change Password</SectionTitle>
      <FieldInput
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder="Current password"
        autoComplete="current-password"
      />
      <FieldInput
        type="password"
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
        placeholder="New password (min 12 chars)"
        autoComplete="new-password"
        style={{ marginTop: 6 }}
      />
      <FieldInput
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        autoComplete="new-password"
        style={{ marginTop: 6 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <SaveButton busy={busy} label="Change Password" />
        {msg && (
          <span
            style={{
              fontSize: 11,
              color: msg === 'Password changed' ? 'var(--xp-success)' : 'var(--xp-danger)',
            }}
          >
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--xp-ink)' }}>
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

