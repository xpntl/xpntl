import type { ReactNode } from 'react';

const TILE_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="3" ry="3" fill="#F3CB00"/>
  <path d="M 19 75 L 83 70 L 83 20 C 67 61, 42 75, 19 75 Z" fill="#BC9200"/>
  <line x1="19" y1="75" x2="83" y2="70" stroke="#4E3413" stroke-width="2.5" stroke-dasharray="0 5" stroke-linecap="round"/>
  <path d="M 19 75 C 42 75, 67 61, 83 20" fill="none" stroke="#180F09" stroke-width="6" stroke-linecap="square"/>
</svg>`;

export function AuthLayout({ children }: { children: ReactNode }) {

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: 'var(--xp-canvas)',
        fontFamily: 'var(--xp-font-mono)',
      }}
    >
      {/* Brand panel */}
      <div
        style={{
          flex: '0 0 420px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '48px 40px',
          borderRight: '1px solid var(--xp-border)',
          background: 'var(--xp-surface)',
          position: 'relative',
          overflow: 'hidden',
        }}
        className="auth-brand-panel"
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            backgroundImage:
              'linear-gradient(var(--xp-ink) 1px, transparent 1px), linear-gradient(90deg, var(--xp-ink) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div style={{ position: 'relative', textAlign: 'center' }}>
          {/* Brand mark */}
          <div
            style={{ width: 80, height: 80, margin: '0 auto 24px' }}
            dangerouslySetInnerHTML={{ __html: TILE_SVG }}
          />

          {/* Wordmark */}
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--xp-ink)',
              letterSpacing: '-0.03em',
              marginBottom: 8,
            }}
          >
            xpntl
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: 'var(--xp-faint)',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            CLOSE · THE · GAP.
          </div>

          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--xp-muted)',
              maxWidth: 280,
              margin: '0 auto',
            }}
          >
            Your agents already went exponential.
            <br />
            Now bring your team.
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: 'var(--xp-faint)',
              maxWidth: 280,
              margin: '12px auto 0',
            }}
          >
            The coordination layer for human + AI engineering teams.
          </div>
        </div>

        {/* Bottom stamp */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            fontSize: 10,
            letterSpacing: '0.1em',
            color: 'var(--xp-faint)',
            textTransform: 'uppercase',
          }}
        >
          v0.1 · ALPHA
        </div>
      </div>

      {/* Form panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
        }}
      >
        {children}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .auth-brand-panel {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
