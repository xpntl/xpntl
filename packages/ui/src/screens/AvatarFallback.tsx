// packages/ui/src/screens/AvatarFallback.tsx
//
// PER-107 — Avatar fallback. The deterministic algorithm visualized: 4 steps,
// 12-step ramp, 24 names mapped, sizes + stacks. Pure spec — drop into a
// Storybook story or docs page.

import { Avatar, AvatarStack } from '../primitives/Avatar';
import { avatarInitials } from '../utils/avatar';

const NAMES = [
  'Lena Park', 'Theo Wynn',  'Ada Okafor', 'Sam Pinto',  'Joon Park', 'Mira Cohen',
  'Pat Ng',    'Ryo Tanaka', 'Vera Ilić',  'Otis Brand', 'Hugo Reyes', 'Eva Lindqvist',
  'Tomás Aguirre', 'Yara Bittar', 'Niko Fjord',  'Wren Halberd', 'Jules Castro', 'Min Sato',
  'Kira Davies',   'Rohan Sethi', 'Ola Sigurd',  'Beck Marlow',  'Tia Okonkwo',  'Ines Garrido',
];

const STEPS = [
  { n: '01', t: 'NORMALIZE', body: <>Lowercase, trim, collapse whitespace.<br /><span className="xp-muted">"Lena&nbsp;&nbsp;Park" → "lena park"</span></> },
  { n: '02', t: 'HASH',      body: <>DJB2 hash — 5-bit shift, signed-int safe.<br /><span className="xp-mono xp-muted">5381 → 0x7c… → |abs|</span></> },
  { n: '03', t: 'INDEX',     body: <>Modulo by ramp length (12).<br /><span className="xp-mono xp-muted">hash % 12 → 0..11</span></> },
  { n: '04', t: 'TINT',      body: <>Look up <span className="xp-mono">--xp-av-N</span>. Initials drawn on top in mono.</> },
];

export function AvatarFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--xp-font-mono)' }}>
      {/* Algorithm */}
      <div>
        <div className="xp-meta" style={{ marginBottom: 10 }}>ALGORITHM · 4 STEPS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {STEPS.map(step => (
            <div key={step.n} style={{
              padding: '12px 14px',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              background: 'var(--xp-surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="xp-mono xp-muted" style={{ fontSize: 11, letterSpacing: 'var(--xp-track-caps)' }}>{step.n}</span>
                <span className="xp-caps" style={{ fontWeight: 600 }}>{step.t}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--xp-ink)', lineHeight: 1.55 }}>{step.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ramp */}
      <div>
        <div className="xp-meta" style={{ marginBottom: 10 }}>RAMP · 12 STEPS · TOKENIZED AS --XP-AV-1..12</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{
              flex: 1, padding: 8,
              background: `var(--xp-av-${i + 1})`,
              color: 'oklch(98% 0.005 60)',
              borderRadius: 'var(--xp-r-sm)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              minHeight: 64, fontFamily: 'var(--xp-font-mono)',
            }}>
              <div style={{ fontSize: 9, letterSpacing: 'var(--xp-track-caps)', opacity: 0.85 }}>
                AV-{String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(i * 360 / 12)}°</div>
            </div>
          ))}
        </div>
      </div>

      {/* Names */}
      <div>
        <div className="xp-meta" style={{ marginBottom: 10 }}>FALLBACK · 24 NAMES → 24 AVATARS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {NAMES.map(n => (
            <div key={n} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px',
              border: '1px solid var(--xp-hairline)',
              background: 'var(--xp-surface)',
              borderRadius: 'var(--xp-r-sm)',
            }}>
              <Avatar name={n} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 11.5, color: 'var(--xp-ink)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{n}</div>
                <div className="xp-meta">{avatarInitials(n)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sizes and stacks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className="xp-meta" style={{ marginBottom: 10 }}>SIZES · 16 / 20 / 24 / 32 / 40 / 56</div>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12 }}>
            {[16, 20, 24, 32, 40, 56].map(s => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Avatar name="Lena Park" size={s} />
                <span className="xp-meta">{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="xp-meta" style={{ marginBottom: 10 }}>STACKS · OVERLAP, OVERFLOW</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AvatarStack names={['Lena Park', 'Theo Wynn', 'Ada Okafor']} size={24} />
            <AvatarStack names={['Lena Park', 'Theo Wynn', 'Ada Okafor', 'Sam Pinto', 'Joon Park', 'Mira Cohen', 'Pat Ng']} size={24} max={4} />
            <AvatarStack names={['Wren Halberd', 'Jules Castro', 'Min Sato', 'Kira Davies', 'Rohan Sethi']} size={24} max={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
