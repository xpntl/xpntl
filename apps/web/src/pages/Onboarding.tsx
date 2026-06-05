import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthError, AuthField, AuthSubmitButton } from '../components/AuthFormParts';
import { AuthLayout } from '../components/AuthLayout';
import { FetchError, type WorkspaceMembership, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function OnboardingPage() {
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const setSession = useAuth((s) => s.setSession);
  const clearAll = useAuth((s) => s.clearAll);

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceKey, setWorkspaceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // XP-116: if this account already belongs to workspaces, offer to enter them
  // rather than forcing new-workspace creation (the old "stuck on setup" trap).
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [enterBusy, setEnterBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .listWorkspaceMemberships(token)
      .then((r) => {
        if (!cancelled) setMemberships(r.memberships);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) return null;

  async function handleEnter(workspaceId: string) {
    setEnterBusy(workspaceId);
    setError(null);
    try {
      const result = await api.switchWorkspace({ workspaceId }, token);
      setSession(result);
      navigate('/');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Could not open that workspace');
    } finally {
      setEnterBusy(null);
    }
  }

  // XP-116: escape hatch — never trap a signed-in account on this page.
  async function handleSignOut() {
    try {
      await api.logout(token);
    } catch {
      // best-effort; clear locally regardless
    }
    clearAll();
    navigate('/signin', { replace: true });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await api.onboarding(
        { workspaceName, workspaceSlug, workspaceKey: workspaceKey.toUpperCase() },
        token,
      );
      setSession({ ...result, token: token! });
      navigate('/onboarding/plan');
    } catch (err) {
      if (err instanceof FetchError) {
        setError(err.message);
        if (err.issues) {
          const map: Record<string, string> = {};
          for (const issue of err.issues) map[issue.path] = issue.message;
          setFieldErrors(map);
        }
      } else {
        setError('Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  }

  const labelStyle = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'var(--xp-accent)',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  };

  return (
    <AuthLayout>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {memberships.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={labelStyle}>Your workspaces</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memberships.map((m) => (
                <button
                  key={m.workspace.id}
                  type="button"
                  disabled={enterBusy !== null}
                  onClick={() => handleEnter(m.workspace.id)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--xp-canvas)',
                    border: '1px solid var(--xp-border)',
                    borderRadius: 8,
                    color: 'var(--xp-ink)',
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: enterBusy !== null ? 'default' : 'pointer',
                    opacity: enterBusy !== null && enterBusy !== m.workspace.id ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 700 }}>{m.workspace.name}</span>
                    <span style={{ color: 'var(--xp-faint)', marginLeft: 8, fontSize: 11 }}>
                      /{m.workspace.slug}
                    </span>
                  </span>
                  {enterBusy === m.workspace.id && (
                    <span style={{ fontSize: 11, color: 'var(--xp-muted)' }}>Loading…</span>
                  )}
                </button>
              ))}
            </div>
            <div
              style={{
                margin: '20px 0 0',
                fontSize: 11,
                color: 'var(--xp-muted)',
                fontFamily: 'var(--xp-font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Or set up a new one
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 28 }}>
            {memberships.length === 0 && <div style={labelStyle}>Almost there</div>}
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--xp-ink)',
                letterSpacing: '-0.02em',
                margin: 0,
                fontFamily: 'var(--xp-font-mono)',
              }}
            >
              Set up your workspace
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--xp-muted)', lineHeight: 1.5 }}>
              Your workspace holds your issues, projects, and team. You can change these settings
              later.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <AuthField
              label="Workspace name"
              value={workspaceName}
              onChange={setWorkspaceName}
              placeholder="Acme Corp"
              hint="1–100 characters. Shown in the sidebar and titles."
              error={fieldErrors.workspaceName}
              required
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <AuthField
                  label="Slug"
                  value={workspaceSlug}
                  onChange={(v) => setWorkspaceSlug(v.toLowerCase())}
                  placeholder="acme"
                  hint="3–40 lowercase, used in URLs."
                  error={fieldErrors.workspaceSlug}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <AuthField
                  label="Issue prefix"
                  value={workspaceKey}
                  onChange={(v) => setWorkspaceKey(v.toUpperCase())}
                  placeholder="ACME"
                  hint="2–10 uppercase, e.g. ACME-42."
                  error={fieldErrors.workspaceKey}
                  required
                />
              </div>
            </div>
          </div>

          <AuthError error={error} fieldErrors={fieldErrors} />
          <AuthSubmitButton busy={busy} label="CREATE WORKSPACE" busyLabel="CREATING WORKSPACE…" />
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 18,
            padding: 0,
            background: 'transparent',
            border: 0,
            color: 'var(--xp-muted)',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 12,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Sign out / use a different account
        </button>
      </div>
    </AuthLayout>
  );
}
