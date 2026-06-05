import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '@xpntl/ui';
import { AuthField, AuthError, AuthSubmitButton, SsoSection } from '../components/AuthFormParts';
import { AuthLayout } from '../components/AuthLayout';
import { type LoginResponse, type WorkspaceMembership, FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { authenticateWithPasskey, passkeysSupported } from '../lib/passkey-client';

function getInitialError(params: URLSearchParams): string | null {
  const oauthError = params.get('error');
  if (oauthError) return oauthError;
  const reason = params.get('reason');
  if (reason === 'idle') return 'You were signed out due to inactivity.';
  if (reason === 'expired') return 'Your session has expired. Please sign in again.';
  return null;
}

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  const setPartialSession = useAuth((s) => s.setPartialSession);

  // Where to land after sign-in. Used by deep links like the invite-accept page
  // (?next=/invites/accept?token=…). Only same-origin relative paths are honored
  // so the param can't be turned into an open redirect.
  const nextParam = searchParams.get('next');
  const nextTarget =
    nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  // Forward `next` when bouncing to sign-up, so an invitee who creates an account
  // still resumes to the invite-accept page.
  const signupHref = nextParam ? `/signup?next=${encodeURIComponent(nextParam)}` : '/signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => getInitialError(searchParams));

  const [memberships, setMemberships] = useState<WorkspaceMembership[] | null>(null);
  const [chooserToken, setChooserToken] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState<string | null>(null);
  const [defaultBusy, setDefaultBusy] = useState<string | null>(null);
  const [autoSkipping, setAutoSkipping] = useState(false);

  // MFA second step
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const autoSkipArmed = useRef(false);
  const autoSkipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoSkipTimer = useCallback(() => {
    if (autoSkipTimer.current) {
      clearTimeout(autoSkipTimer.current);
      autoSkipTimer.current = null;
    }
  }, []);

  const handlePickWorkspace = useCallback(
    async (workspaceId: string) => {
      clearAutoSkipTimer();
      setPickBusy(workspaceId);
      setError(null);
      try {
        const result = await api.chooseWorkspace(workspaceId, chooserToken);
        // chooserToken is null for the cookie-based SSO path; the cookie session
        // was just upgraded in place, so carry a cookie sentinel token.
        const sessionToken = chooserToken ?? `cookie:${result.user.id}`;
        setSession({ ...result, token: sessionToken });
        navigate(nextTarget);
      } catch (err) {
        setAutoSkipping(false);
        setError(err instanceof FetchError ? err.message : 'Something went wrong');
      } finally {
        setPickBusy(null);
      }
    },
    [chooserToken, setSession, navigate, nextTarget, clearAutoSkipTimer],
  );

  // SSO (OAuth) returns multi-workspace accounts to /signin?step=choose with the
  // session cookie set but no workspace bound yet. Load the account's workspaces
  // via the cookie and show the chooser. (XP-117)
  const ssoChooseHandled = useRef(false);
  useEffect(() => {
    if (searchParams.get('step') !== 'choose' || ssoChooseHandled.current) return;
    ssoChooseHandled.current = true;
    api
      .listWorkspaceMemberships()
      .then((r) => {
        if (r.memberships.length > 0) {
          setMemberships(r.memberships);
          setChooserToken(null); // cookie-based session; no bearer token to carry
        } else {
          navigate('/onboarding', { replace: true });
        }
      })
      .catch(() => setError('Could not load your workspaces — please sign in again.'));
  }, [searchParams, navigate]);

  // Auto-skip the chooser when the account has a default workspace (XP-121).
  // Brief interstitial so the user can stay and pick another. Suppressed with
  // ?choose=1 (e.g. an explicit "switch workspace at sign-in" link).
  useEffect(() => {
    if (!memberships || autoSkipArmed.current) return;
    if (searchParams.get('choose') === '1') return;
    if (memberships.length <= 1) return;
    const def = memberships.find((m) => m.isDefault);
    if (!def) return;
    autoSkipArmed.current = true;
    setAutoSkipping(true);
    autoSkipTimer.current = setTimeout(() => {
      void handlePickWorkspace(def.workspace.id);
    }, 1100);
    return clearAutoSkipTimer;
  }, [memberships, searchParams, handlePickWorkspace, clearAutoSkipTimer]);

  function cancelAutoSkip() {
    clearAutoSkipTimer();
    setAutoSkipping(false);
  }

  // Route a login/verify-mfa result to the right next step.
  async function applyResult(result: LoginResponse): Promise<void> {
    if ('step' in result && result.step === 'mfa') {
      setMfaToken(result.mfaToken);
      return;
    }
    if ('step' in result && result.step === 'onboarding') {
      setPartialSession({ account: result.account, token: result.token });
      navigate('/onboarding');
      return;
    }
    if ('step' in result && result.step === 'choose_workspace') {
      setMfaToken(null); // MFA (if any) already cleared; now picking a workspace
      setChooserToken(result.token);
      // Enrich with isDefault / avatar via the authenticated memberships endpoint
      // (the login payload omits them). Fall back to the raw payload on failure.
      try {
        const { memberships: enriched } = await api.listWorkspaceMemberships(result.token);
        setMemberships(enriched);
      } catch {
        setMemberships(
          result.memberships.map((m) => ({ ...m, isCurrent: false, isDefault: false })),
        );
      }
      return;
    }
    setSession(result);
    navigate(nextTarget);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMemberships(null);
    autoSkipArmed.current = false;
    try {
      await applyResult(await api.login({ email, password }));
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskey() {
    setBusy(true);
    setError(null);
    try {
      await applyResult(await authenticateWithPasskey());
    } catch (err) {
      const m = err instanceof FetchError ? err.message : err instanceof Error ? err.message : 'Passkey sign-in failed';
      // Swallow user-cancelled / no-credential ceremonies.
      if (!/cancel|abort|NotAllowed|timed out/i.test(m)) setError(m);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setBusy(true);
    setError(null);
    try {
      await applyResult(await api.verifyMfa({ mfaToken, code: mfaCode.trim() }));
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  // Toggle the account's default workspace from the chooser. Clicking the
  // current default clears it; clicking another sets it.
  async function handleSetDefault(workspaceId: string) {
    cancelAutoSkip();
    setDefaultBusy(workspaceId);
    setError(null);
    try {
      const current = memberships?.find((m) => m.isDefault)?.workspace.id ?? null;
      const next = current === workspaceId ? null : workspaceId;
      await api.setDefaultWorkspace(next, chooserToken);
      setMemberships((prev) =>
        prev ? prev.map((m) => ({ ...m, isDefault: m.workspace.id === next })) : prev,
      );
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Could not update default workspace');
    } finally {
      setDefaultBusy(null);
    }
  }

  const defaultName = memberships?.find((m) => m.isDefault)?.workspace.name ?? null;

  return (
    <AuthLayout>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--xp-accent)', textTransform: 'uppercase', marginBottom: 8 }}>
            {memberships ? 'ONE MORE STEP' : 'WELCOME BACK'}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--xp-ink)', letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--xp-font-mono)' }}>
            {memberships ? 'Choose a workspace' : 'Sign in to xpntl'}
          </h1>
        </div>

        {mfaToken ? (
          <form onSubmit={handleVerifyMfa}>
            <div style={{ fontSize: 13, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 14, lineHeight: 1.5 }}>
              Enter the 6-digit code from your authenticator app (or a recovery code).
            </div>
            <AuthField
              label="Authentication code"
              type="text"
              value={mfaCode}
              onChange={setMfaCode}
              autoComplete="one-time-code"
              required
            />
            <AuthError error={error} />
            <AuthSubmitButton busy={busy} label="VERIFY" busyLabel="VERIFYING…" />
            <button
              type="button"
              onClick={() => { setMfaToken(null); setMfaCode(''); setError(null); }}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '9px 16px',
                background: 'transparent',
                color: 'var(--xp-muted)',
                border: '1px solid var(--xp-border)',
                borderRadius: 8,
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              BACK
            </button>
          </form>
        ) : (
        <>
        {!memberships && <SsoSection />}

        {!memberships && passkeysSupported() && (
          <button
            type="button"
            onClick={handlePasskey}
            disabled={busy}
            style={{
              width: '100%',
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--xp-canvas)',
              color: 'var(--xp-ink)',
              border: '1px solid var(--xp-border)',
              borderRadius: 8,
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <circle cx="6" cy="6" r="3" />
              <path d="M6 9c-2.2 0-3.5 1.3-3.5 3M10 7l3.5 3.5M12 9l1.5 1.5M11 11.5L12.5 13" />
            </svg>
            Sign in with a passkey
          </button>
        )}

        <form onSubmit={handleSubmit}>
          {!memberships && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AuthField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
              <AuthField label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
            </div>
          )}

          <AuthError error={error} />

          {memberships && memberships.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {autoSkipping && defaultName && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '9px 12px',
                    marginBottom: 12,
                    background: 'var(--xp-accent-soft, rgba(243,203,0,0.10))',
                    border: '1px solid var(--xp-accent)',
                    borderRadius: 8,
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 12,
                    color: 'var(--xp-ink)',
                  }}
                >
                  <span>
                    Continuing to <strong>{defaultName}</strong>…
                  </span>
                  <button
                    type="button"
                    onClick={cancelAutoSkip}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--xp-accent-strong)',
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Stay & choose
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {memberships.map((m) => {
                  const ws = m.workspace;
                  const loadingThis = pickBusy === ws.id;
                  const someBusy = pickBusy !== null;
                  return (
                    <div
                      key={ws.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 12px',
                        background: 'var(--xp-canvas)',
                        border: `1px solid ${m.isDefault ? 'var(--xp-accent)' : 'var(--xp-border)'}`,
                        borderRadius: 10,
                        opacity: someBusy && !loadingThis ? 0.5 : 1,
                        transition: 'opacity 0.15s, border-color 0.15s',
                      }}
                    >
                      <button
                        type="button"
                        disabled={someBusy}
                        onClick={() => handlePickWorkspace(ws.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 0,
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: someBusy ? 'default' : 'pointer',
                        }}
                      >
                        <Avatar name={ws.name} src={ws.avatarUrl ?? undefined} size={40} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                fontFamily: 'var(--xp-font-mono)',
                                fontSize: 14,
                                fontWeight: 700,
                                color: 'var(--xp-ink)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {ws.name}
                            </span>
                            {m.isDefault && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: '0.06em',
                                  textTransform: 'uppercase',
                                  color: 'var(--xp-accent-strong)',
                                  border: '1px solid var(--xp-accent)',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Default
                              </span>
                            )}
                          </span>
                          <span style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 11, color: 'var(--xp-faint)' }}>
                            /{ws.slug} · {m.user.role}
                          </span>
                        </span>
                      </button>

                      {loadingThis ? (
                        <span style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>Loading…</span>
                      ) : (
                        <button
                          type="button"
                          disabled={defaultBusy !== null || someBusy}
                          onClick={() => handleSetDefault(ws.id)}
                          title={m.isDefault ? 'Default workspace — click to unset' : 'Set as default workspace'}
                          aria-label={m.isDefault ? 'Unset default workspace' : 'Set as default workspace'}
                          style={{
                            flex: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 30,
                            height: 30,
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 6,
                            color: m.isDefault ? 'var(--xp-accent-strong)' : 'var(--xp-faint)',
                            cursor: defaultBusy !== null ? 'default' : 'pointer',
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill={m.isDefault ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!memberships && <AuthSubmitButton busy={busy} label="SIGN IN" busyLabel="SIGNING IN…" />}

          {memberships && (
            <button
              type="button"
              onClick={() => {
                cancelAutoSkip();
                autoSkipArmed.current = false;
                setMemberships(null);
                setChooserToken(null);
                setError(null);
              }}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '9px 16px',
                background: 'transparent',
                color: 'var(--xp-muted)',
                border: '1px solid var(--xp-border)',
                borderRadius: 8,
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              BACK
            </button>
          )}
        </form>
        </>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>
          New here?{' '}
          <Link to={signupHref} style={{ color: 'var(--xp-accent-strong)', textDecoration: 'none' }}>Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
