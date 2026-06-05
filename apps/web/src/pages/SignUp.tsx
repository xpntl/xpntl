import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthError, AuthField, AuthSubmitButton, SsoSection } from '../components/AuthFormParts';
import { AuthLayout } from '../components/AuthLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function SignUpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setPartialSession = useAuth((s) => s.setPartialSession);

  // Deep-link resume (e.g. accepting a workspace invite): after sign-up, land on
  // `next` instead of onboarding — so an invitee joins the inviting workspace
  // rather than being forced to create their own. Same-origin relative paths
  // only, to avoid an open redirect.
  const nextParam = searchParams.get('next');
  const nextTarget = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;
  const signinHref = nextParam ? `/signin?next=${encodeURIComponent(nextParam)}` : '/signin';

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await api.register({
        email,
        password,
        displayName: displayName.trim() || undefined,
      });
      setPartialSession(result);
      navigate(nextTarget ?? '/onboarding');
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

  return (
    <AuthLayout>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: 'var(--xp-accent)',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            GET STARTED
          </div>
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
            Create your account
          </h1>
          <p
            style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--xp-muted)', lineHeight: 1.5 }}
          >
            Get started with an account. No credit card required. SSO always free.
          </p>
        </div>

        <SsoSection />

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              error={fieldErrors.email}
              required
            />
            <AuthField
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Jane Smith"
              hint="Optional. Shown to teammates."
              error={fieldErrors.displayName}
            />
            <AuthField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              hint="At least 12 characters."
              error={fieldErrors.password}
              required
            />
            <AuthField
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
              required
            />
          </div>

          <AuthError error={error} fieldErrors={fieldErrors} />
          <AuthSubmitButton busy={busy} label="CREATE ACCOUNT" busyLabel="CREATING ACCOUNT…" />
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 12,
            color: 'var(--xp-muted)',
            fontFamily: 'var(--xp-font-mono)',
          }}
        >
          Already have an account?{' '}
          <Link
            to={signinHref}
            style={{ color: 'var(--xp-accent-strong)', textDecoration: 'none' }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
