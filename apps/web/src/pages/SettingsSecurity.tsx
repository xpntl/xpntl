import { type FormEvent, useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { type MfaStatus, type Passkey, FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { passkeysSupported, registerPasskey } from '../lib/passkey-client';

export function SettingsSecurityPage() {
  const { token } = useAuth();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    if (!token) return;
    api.me(token).then((r) => {
      setHasPassword(r.hasPassword ?? true);
      setProviders(r.providers ?? []);
    });
  }, [token]);

  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Security</h1>
      <AuthTypeSection providers={providers} />
      {hasPassword && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />
          <PasswordForm />
        </>
      )}
      <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />
      <TwoFactorSection />
      <hr style={{ border: 'none', borderTop: '1px solid var(--xp-hairline)', margin: '24px 0' }} />
      <PasskeysSection />
    </SettingsLayout>
  );
}

function TwoFactorSection() {
  const { token } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrolling, setEnrolling] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [actionCode, setActionCode] = useState('');
  const [mode, setMode] = useState<'idle' | 'disable' | 'regen'>('idle');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.mfaStatus(token).then(setStatus).catch(() => {});
  }, [token]);

  async function refresh() {
    setStatus(await api.mfaStatus(token));
  }

  async function startEnroll() {
    setBusy(true);
    setMsg(null);
    try {
      const e = await api.mfaStart(token);
      setEnrolling({ qrDataUrl: e.qrDataUrl, secret: e.secret });
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to start setup');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { recoveryCodes: codes } = await api.mfaConfirm(code.trim(), token);
      setRecoveryCodes(codes);
      setEnrolling(null);
      setCode('');
      await refresh();
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to verify code');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'disable') {
        await api.mfaDisable(actionCode.trim(), token);
        setMode('idle');
        setRecoveryCodes(null);
        await refresh();
      } else if (mode === 'regen') {
        const { recoveryCodes: codes } = await api.mfaRegenerateRecoveryCodes(actionCode.trim(), token);
        setRecoveryCodes(codes);
        setMode('idle');
        await refresh();
      }
      setActionCode('');
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed — check the code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <SectionTitle>Two-factor authentication</SectionTitle>

      {recoveryCodes && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--xp-accent-strong)', borderRadius: 'var(--xp-r-sm)', background: 'var(--xp-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Save your recovery codes</div>
          <div style={{ fontSize: 10.5, color: 'var(--xp-muted)', marginBottom: 8 }}>
            Each can be used once if you lose your authenticator. They won't be shown again.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontFamily: 'var(--xp-font-mono)', fontSize: 12 }}>
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button type="button" onClick={() => setRecoveryCodes(null)} style={{ ...ghostBtn, marginTop: 8 }}>
            Done
          </button>
        </div>
      )}

      {status === null ? (
        <div style={{ fontSize: 11, color: 'var(--xp-faint)' }}>Loading…</div>
      ) : enrolling ? (
        <form onSubmit={confirmEnroll}>
          <div style={{ fontSize: 11, color: 'var(--xp-muted)', marginBottom: 8 }}>
            Scan this with your authenticator app, then enter the 6-digit code to finish.
          </div>
          <img src={enrolling.qrDataUrl} alt="TOTP QR code" width={160} height={160} style={{ borderRadius: 'var(--xp-r-sm)', background: '#fff', padding: 6 }} />
          <div style={{ fontSize: 10.5, color: 'var(--xp-faint)', margin: '6px 0' }}>
            Or enter this key manually: <code style={{ fontFamily: 'var(--xp-font-mono)' }}>{enrolling.secret}</code>
          </div>
          <FieldInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <SaveButton busy={busy} label="Verify & enable" />
            <button type="button" onClick={() => { setEnrolling(null); setCode(''); }} style={ghostBtn}>Cancel</button>
          </div>
        </form>
      ) : status.enabled ? (
        <>
          <div style={{ fontSize: 11.5, marginBottom: 6 }}>
            <span style={{ color: 'var(--xp-success)', fontWeight: 600 }}>● On</span>
            <span style={{ color: 'var(--xp-muted)' }}> — {status.recoveryCodesRemaining} recovery codes left</span>
          </div>
          {mode === 'idle' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setMode('regen')} style={ghostBtn}>Regenerate recovery codes</button>
              <button type="button" onClick={() => setMode('disable')} style={{ ...ghostBtn, color: 'var(--xp-danger)', borderColor: 'var(--xp-danger)' }}>Disable</button>
            </div>
          ) : (
            <form onSubmit={runAction}>
              <div style={{ fontSize: 11, color: 'var(--xp-muted)', marginBottom: 6 }}>
                Enter a current code (or recovery code) to {mode === 'disable' ? 'disable two-factor' : 'regenerate recovery codes'}.
              </div>
              <FieldInput value={actionCode} onChange={(e) => setActionCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <SaveButton busy={busy} label={mode === 'disable' ? 'Disable' : 'Regenerate'} />
                <button type="button" onClick={() => { setMode('idle'); setActionCode(''); }} style={ghostBtn}>Cancel</button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--xp-faint)', marginBottom: 12 }}>
            Add a one-time code from an authenticator app as a second step at sign-in.
          </div>
          <button type="button" onClick={startEnroll} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Starting…' : 'Enable two-factor'}
          </button>
        </>
      )}

      {msg && <div style={{ fontSize: 11, color: 'var(--xp-danger)', marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-accent)',
  color: 'var(--xp-accent-fg)',
  border: 'none',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--xp-font-mono)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};

function AuthTypeSection({ providers }: { providers: string[] }) {
  const displayProviders = providers.length > 0
    ? providers.map(formatProvider).join(', ')
    : 'Email + Password';

  return (
    <div style={{ maxWidth: 400 }}>
      <SectionTitle>Auth Type</SectionTitle>
      <FieldInput value={displayProviders} disabled style={{ opacity: 0.7 }} />
      <div style={{ fontSize: 10.5, color: 'var(--xp-faint)', marginTop: 4 }}>
        Authentication methods linked to your account.
      </div>
    </div>
  );
}

function formatProvider(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'password':
    case 'email':
      return 'Email + Password';
    case 'google':
      return 'Google SSO';
    case 'apple':
      return 'Apple SSO';
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
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

function PasskeysSection() {
  const { token } = useAuth();
  const [list, setList] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const supported = passkeysSupported();

  useEffect(() => {
    if (!token) return;
    api.listPasskeys(token).then((r) => setList(r.passkeys)).catch(() => setList([]));
  }, [token]);

  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      await registerPasskey(token);
      const r = await api.listPasskeys(token);
      setList(r.passkeys);
    } catch (err) {
      // User-cancelled ceremonies throw; show a soft message only for real errors.
      const m = err instanceof FetchError ? err.message : err instanceof Error ? err.message : 'Failed to add passkey';
      if (!/cancel|abort|NotAllowed/i.test(m)) setMsg(m);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deletePasskey(id, token);
      setList((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to remove passkey');
    }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <SectionTitle>Passkeys</SectionTitle>
      <div style={{ fontSize: 11, color: 'var(--xp-faint)', marginBottom: 12 }}>
        Sign in with Face ID, Touch ID, Windows Hello, or a security key — no password needed.
      </div>

      {!supported ? (
        <div style={{ fontSize: 11, color: 'var(--xp-muted)' }}>
          This browser doesn't support passkeys.
        </div>
      ) : (
        <>
          {list && list.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {list.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    border: '1px solid var(--xp-hairline)',
                    borderRadius: 'var(--xp-r-sm)',
                    background: 'var(--xp-surface)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{p.name || 'Passkey'}</div>
                    <div style={{ fontSize: 10, color: 'var(--xp-faint)' }}>
                      Added {new Date(p.createdAt).toLocaleDateString()}
                      {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(p.id)} title="Remove passkey" style={ghostBtn}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={add} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Waiting for passkey…' : 'Add a passkey'}
          </button>
        </>
      )}
      {msg && <div style={{ fontSize: 11, color: 'var(--xp-danger)', marginTop: 8 }}>{msg}</div>}
    </div>
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
