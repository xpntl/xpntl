import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { AuthError } from '../components/AuthFormParts';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function DevicePage() {
  const [searchParams] = useSearchParams();
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const workspace = useAuth((s) => s.workspace);
  const [code, setCode] = useState(() => searchParams.get('code') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.deviceApprove(code.trim(), token);
      setApproved(true);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const displayName = user?.displayName ?? user?.email ?? 'Unknown';

  return (
    <AuthLayout>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--xp-accent)', textTransform: 'uppercase', marginBottom: 8 }}>
            DEVICE LOGIN
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--xp-ink)', letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--xp-font-mono)' }}>
            Authorize CLI
          </h1>
          <p style={{ color: 'var(--xp-muted)', fontSize: 13, fontFamily: 'var(--xp-font-mono)', marginTop: 8, lineHeight: 1.5 }}>
            Enter the code shown in your terminal to sign in to the xpntl CLI.
          </p>
        </div>

        {user && workspace && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--xp-canvas)',
            border: '1px solid var(--xp-border)',
            borderRadius: 8,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--xp-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#000',
                flexShrink: 0,
              }}>
                {displayName[0]?.toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--xp-ink)', fontFamily: 'var(--xp-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>
                {workspace.name}
              </div>
            </div>
          </div>
        )}

        {approved ? (
          <div style={{
            padding: '20px 24px',
            background: 'var(--xp-canvas)',
            border: '1px solid var(--xp-accent)',
            borderRadius: 8,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--xp-accent)', fontFamily: 'var(--xp-font-mono)', marginBottom: 4 }}>
              Device authorized
            </div>
            <p style={{ fontSize: 12, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', margin: 0 }}>
              CLI signed in as {displayName}. You can close this window.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="device-code"
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: 'var(--xp-muted)',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--xp-font-mono)',
                  marginBottom: 6,
                }}
              >
                Device code
              </label>
              <input
                id="device-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--xp-canvas)',
                  border: '1px solid var(--xp-border)',
                  borderRadius: 8,
                  color: 'var(--xp-ink)',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <AuthError error={error} />

            <button
              type="submit"
              disabled={busy || !code.trim()}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'var(--xp-accent)',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy || !code.trim() ? 0.6 : 1,
              }}
            >
              {busy ? 'AUTHORIZING…' : 'AUTHORIZE DEVICE'}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
