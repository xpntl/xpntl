import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const PROVIDER_SLUG: Record<string, string> = {
  Google: 'google',
  GitHub: 'github',
  Microsoft: 'microsoft',
  Apple: 'apple',
};

function useDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return dark;
}

/* ---------- inline SVG icons ---------- */

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" width="20" height="20">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function GitHubIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={color}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function AppleIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={color}>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/* ---------- brand icons per provider ---------- */

const BRAND_ICONS: Record<string, (dark: boolean) => React.ReactNode> = {
  Google: () => <GoogleIcon />,
  Microsoft: () => <MicrosoftIcon />,
  GitHub: (dark: boolean) => <GitHubIcon color={dark ? '#e3e3e3' : '#1f1f1f'} />,
  Apple: (dark: boolean) => <AppleIcon color={dark ? '#e3e3e3' : '#1f1f1f'} />,
};

/* ---------- SsoButton ---------- */

export function SsoButton({ provider }: { provider: string }) {
  const slug = PROVIDER_SLUG[provider] ?? provider.toLowerCase();
  const dark = useDarkMode();
  const iconFn = BRAND_ICONS[provider];

  return (
    <button
      type="button"
      onClick={() => {
        const url = new URL(`${API_URL}/v1/auth/oauth/${slug}`);
        window.location.href = url.toString();
      }}
      style={{
        width: '100%',
        height: 40,
        background: 'var(--xp-canvas)',
        border: '1px solid var(--xp-border)',
        borderRadius: 6,
        color: 'var(--xp-ink)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 0,
        boxSizing: 'border-box',
      }}
    >
      {iconFn ? iconFn(dark) : null}
      <span>Continue with {provider}</span>
    </button>
  );
}

/* ---------- SsoSection ---------- */

const DISPLAY_ORDER = ['Google', 'Microsoft', 'GitHub', 'Apple'];
const SLUG_TO_DISPLAY: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
};

export function SsoSection() {
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/v1/auth/oauth/providers`)
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((data) => {
        const available = (data.providers as string[]).map((s) => SLUG_TO_DISPLAY[s] ?? s);
        setProviders(DISPLAY_ORDER.filter((p) => available.includes(p)));
      })
      .catch(() => {});
  }, []);

  if (providers.length === 0) return null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {providers.map((p) => (
          <SsoButton key={p} provider={p} />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1, height: 1, background: 'var(--xp-border)' }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--xp-faint)',
            fontFamily: 'var(--xp-font-mono)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          or continue with email
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--xp-border)' }} />
      </div>
    </>
  );
}

export function AuthField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  required,
  accent,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  accent?: boolean;
  autoComplete?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: error ? 'var(--xp-danger)' : accent ? 'var(--xp-accent)' : 'var(--xp-muted)',
          textTransform: 'uppercase',
          marginBottom: 6,
          fontFamily: 'var(--xp-font-mono)',
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        style={{
          display: 'block',
          width: '100%',
          padding: '10px 12px',
          background: 'var(--xp-canvas)',
          border: `1px solid ${error ? 'var(--xp-danger)' : accent ? 'oklch(55% 0.12 85)' : 'var(--xp-border)'}`,
          borderRadius: 6,
          color: 'var(--xp-ink)',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
      {error ? (
        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--xp-danger)' }}>{error}</span>
      ) : hint ? (
        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--xp-faint)' }}>{hint}</span>
      ) : null}
    </label>
  );
}

export function AuthError({ error, fieldErrors }: { error: string | null; fieldErrors?: Record<string, string> }) {
  if (!error) return null;
  const hasFieldErrors = fieldErrors && Object.keys(fieldErrors).length > 0;
  return (
    <div
      style={{
        marginTop: 16,
        padding: '10px 12px',
        fontSize: 12,
        borderRadius: 6,
        background: 'oklch(25% 0.04 25)',
        color: 'oklch(70% 0.14 25)',
        border: '1px solid oklch(35% 0.06 25)',
      }}
    >
      {hasFieldErrors ? 'Please fix the highlighted fields.' : error}
    </div>
  );
}

export function AuthSubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={{
        width: '100%',
        marginTop: 24,
        padding: '11px 16px',
        background: 'var(--xp-accent)',
        color: '#180F09',
        border: 'none',
        borderRadius: 8,
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
