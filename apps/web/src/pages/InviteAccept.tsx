import { Spinner } from '@xpntl/ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthError } from '../components/AuthFormParts';
import { AuthLayout } from '../components/AuthLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

/**
 * Lands the emailed invite link (/invites/accept?token=…). XP-114.
 * - Not signed in → bounce to /signin?next=… and resume here afterward.
 * - Signed in → accept the invite, adopt the returned session (which is bound to
 *   the joined workspace), and drop the user straight into it.
 */
export function InviteAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');
  const sessionToken = useAuth((s) => s.token);
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    if (!inviteToken) {
      setError('This invitation link is missing its token. Ask the sender to resend it.');
      return;
    }

    // Not signed in yet — send them to sign in, then come straight back here.
    if (!sessionToken) {
      const next = `/invites/accept?token=${encodeURIComponent(inviteToken)}`;
      navigate(`/signin?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    handled.current = true;
    void (async () => {
      try {
        const result = await api.acceptInvite(inviteToken, sessionToken);
        setSession(result);
        navigate('/issues', { replace: true });
      } catch (err) {
        setError(
          err instanceof FetchError ? err.message : 'Could not accept this invitation. Try again.',
        );
      }
    })();
  }, [inviteToken, sessionToken, navigate, setSession]);

  return (
    <AuthLayout>
      <div style={{ width: '100%', maxWidth: 400, fontFamily: 'var(--xp-font-mono)' }}>
        <div style={{ marginBottom: 24 }}>
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
            WORKSPACE INVITATION
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--xp-ink)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {error ? "Couldn't accept invite" : 'Joining workspace…'}
          </h1>
        </div>

        {error ? (
          <>
            <AuthError error={error} />
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '10px 16px',
                background: 'var(--xp-canvas)',
                color: 'var(--xp-ink)',
                border: '1px solid var(--xp-border)',
                borderRadius: 8,
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              GO TO MY WORKSPACE
            </button>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--xp-muted)',
              fontSize: 13,
            }}
          >
            <Spinner size={16} />
            Accepting your invitation…
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
