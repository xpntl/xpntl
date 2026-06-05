import { useEffect, useState } from 'react';

export function IdleWarning({ onStay }: { onStay: () => void }) {
  const [seconds, setSeconds] = useState(120);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'var(--xp-surface)',
          border: '1px solid var(--xp-border)',
          borderRadius: 'var(--xp-r-md, 8px)',
          padding: '32px 40px',
          maxWidth: 400,
          textAlign: 'center',
          fontFamily: 'var(--xp-font-mono)',
          boxShadow: 'var(--xp-shadow-3, 0 8px 32px rgba(0,0,0,0.3))',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--xp-ink)' }}>
          Session expiring
        </div>
        <div style={{ fontSize: 12, color: 'var(--xp-muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You've been idle for a while. You'll be signed out in{' '}
          <strong style={{ color: 'var(--xp-accent-strong)' }}>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </strong>
        </div>
        <button
          type="button"
          onClick={onStay}
          style={{
            padding: '8px 24px',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--xp-font-mono)',
            background: 'var(--xp-accent)',
            color: 'var(--xp-accent-fg)',
            border: 'none',
            borderRadius: 'var(--xp-r-sm)',
            cursor: 'pointer',
          }}
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
