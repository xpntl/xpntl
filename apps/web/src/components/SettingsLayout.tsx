import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-store';
import { isAtLeast } from '../lib/roles';

const NAV = [
  { label: 'Profile', href: '/settings/profile' },
  { label: 'Security', href: '/settings/security' },
  { label: 'Sessions', href: '/settings/sessions' },
  { label: 'Workspace', href: '/settings/workspace', minRole: 'Admin' as const },
  { label: 'Team', href: '/settings/team', minRole: 'Admin' as const },
  { label: 'Labels', href: '/settings/labels', minRole: 'Admin' as const },
  { label: 'Automations', href: '/settings/automations', minRole: 'Admin' as const },
  { label: 'Webhooks', href: '/settings/webhooks', minRole: 'Admin' as const },
  { label: 'GitHub', href: '/settings/github', minRole: 'Admin' as const },
  { label: 'API Keys', href: '/settings/api-keys', minRole: 'Admin' as const },
  { label: 'Import', href: '/settings/import', minRole: 'Admin' as const },
  { label: 'Audit Log', href: '/settings/audit', minRole: 'Admin' as const },
  { label: 'Notifications', href: '/settings/notifications' },
  { label: 'Plan & Billing', href: '/settings/billing', minRole: 'Admin' as const },
  { label: 'Organization', href: '/settings/organizations' },
];

export function SettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--xp-canvas)',
        color: 'var(--xp-ink)',
        fontFamily: 'var(--xp-font-mono)',
      }}
    >
      <aside
        style={{
          width: 220,
          flex: 'none',
          borderRight: '1px solid var(--xp-border)',
          padding: '16px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Link
          to="/issues"
          style={{
            padding: '4px 16px 12px',
            fontSize: 11,
            color: 'var(--xp-muted)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ← Back to app
        </Link>
        <div
          style={{
            padding: '0 16px 8px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: 'var(--xp-faint)',
          }}
        >
          SETTINGS
        </div>
        <nav>
          {NAV.filter((it) => !it.minRole || (user && isAtLeast(user.role, it.minRole))).map(
            (it) => {
              const active = location.pathname === it.href;
              return (
                <Link
                  key={it.href}
                  to={it.href}
                  style={{
                    display: 'block',
                    padding: '6px 16px',
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--xp-accent-strong)' : 'var(--xp-ink)',
                    textDecoration: 'none',
                    background: active ? 'var(--xp-layer)' : 'transparent',
                    borderLeft: active
                      ? '2px solid var(--xp-accent-strong)'
                      : '2px solid transparent',
                  }}
                >
                  {it.label}
                </Link>
              );
            },
          )}
        </nav>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>{children}</main>
    </div>
  );
}
