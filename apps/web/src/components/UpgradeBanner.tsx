import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

export function UpgradeBanner() {
  const token = useAuth((s) => s.token);
  const [isFreePlan, setIsFreePlan] = useState(false);
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('xp-upgrade-dismissed') === '1',
  );

  useEffect(() => {
    if (!token) return;
    api.getSubscription(token).then(({ subscription }) => {
      setIsFreePlan(!subscription || subscription.planId === 'free');
    }).catch(() => {
      setIsFreePlan(true);
    });
  }, [token]);

  if (!isFreePlan || dismissed) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '6px 16px',
        background: 'var(--xp-accent-tint, oklch(30% 0.04 80))',
        borderBottom: '1px solid var(--xp-border)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 11,
        color: 'var(--xp-ink)',
      }}
    >
      <span style={{ color: 'var(--xp-accent-strong)', fontWeight: 600 }}>FREE PLAN</span>
      <span style={{ color: 'var(--xp-muted)' }}>
        1 workspace · 1 user · 3 projects · 1 harness key
      </span>
      <Link
        to="/settings/billing"
        style={{
          padding: '2px 10px',
          background: 'var(--xp-accent)',
          color: 'var(--xp-accent-fg)',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textDecoration: 'none',
        }}
      >
        UPGRADE
      </Link>
      <span style={{ color: 'var(--xp-muted)', fontSize: 10 }}>
        30-day free trial on all paid plans
      </span>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem('xp-upgrade-dismissed', '1');
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--xp-faint)',
          cursor: 'pointer',
          fontSize: 14,
          padding: '0 4px',
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
