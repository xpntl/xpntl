// packages/ui/src/screens/Peek.tsx
//
// PER-106 — Slide-over peek. Opens on ⌘↵ over any issue row.
// Renders meta, description, activity, and a comment composer.

import { Fragment, type ReactNode } from 'react';
import { Avatar, AvatarStack } from '../primitives/Avatar';
import { Button } from '../primitives/Button';
import { IssueKey } from '../primitives/IssueKey';
import { Input } from '../primitives/Input';
import { Kbd } from '../primitives/Kbd';
import { Pill } from '../primitives/Pill';
import { Priority } from '../primitives/Priority';
import { StateDot } from '../primitives/StateDot';
import { Tooltip } from '../primitives/Tooltip';

export function Peek() {
  return (
    <div style={{
      width: 440, height: '100%',
      background: 'var(--xp-surface)', color: 'var(--xp-ink)',
      border: '1px solid var(--xp-border)',
      borderRadius: 'var(--xp-r-sm)',
      boxShadow: 'var(--xp-shadow-2)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--xp-font-mono)',
    }}>
      {/* Chrome */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--xp-hairline)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span className="xp-meta">PEEK</span>
        <span className="xp-mono xp-muted" style={{ fontSize: 10.5 }}>perimeter / per-103</span>
        <span style={{ flex: 1 }} />
        <Tooltip content="OPEN FULL VIEW">
          <button style={{
            background: 'transparent', border: 0, color: 'var(--xp-muted)',
            cursor: 'pointer', fontFamily: 'var(--xp-font-mono)', fontSize: 12, padding: 2,
          }}>↗</button>
        </Tooltip>
        <Kbd size="sm">ESC</Kbd>
      </div>

      {/* State strip */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <StateDot kind="started" size={14} />
        <span className="xp-caps">STARTED</span>
        <IssueKey>PER-103</IssueKey>
        <span style={{ flex: 1 }} />
        <Priority kind="high" />
        <span className="xp-mono xp-muted" style={{ fontSize: 11 }}>5 PT</span>
      </div>

      {/* Title */}
      <div style={{
        padding: '4px 14px 12px',
        fontSize: 17, fontWeight: 600,
        letterSpacing: 'var(--xp-track-tight)', lineHeight: 1.2,
      }}>
        Sidebar shell — collapse rail &amp; persistence
      </div>

      {/* Meta */}
      <div style={{
        padding: '0 14px 12px',
        display: 'grid', gridTemplateColumns: '90px 1fr',
        columnGap: 12, rowGap: 7, fontSize: 12,
      }}>
        {([
          ['ASSIGNEE', (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar name="Lena Park" size={18} />
              <span>L. PARK</span>
            </span>
          )],
          ['MILESTONE', '0.42 · KEYBOARD'],
          ['PARENT', <IssueKey>PER-100</IssueKey>],
          ['DUE', <span className="xp-mono">2026-05-22</span>],
          ['LABELS', (
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <Pill leading={<span style={{ width: 5, height: 5, background: 'var(--xp-accent-strong)', borderRadius: 0 }} />}>shell</Pill>
              <Pill leading={<span style={{ width: 5, height: 5, background: 'var(--xp-info)', borderRadius: 0 }} />}>keyboard</Pill>
            </span>
          )],
          ['SUBSCRIBERS', <AvatarStack names={['Lena Park', 'Theo Wynn', 'Ada Okafor', 'Sam Pinto']} size={18} max={4} />],
        ] as [string, ReactNode][]).map(([k, v]) => (
          <Fragment key={k}>
            <span className="xp-meta" style={{ alignSelf: 'center' }}>{k}</span>
            <span style={{ color: 'var(--xp-ink)', alignSelf: 'center' }}>{v}</span>
          </Fragment>
        ))}
      </div>

      <hr className="xp-rule" />

      {/* Description */}
      <div style={{ padding: '14px 14px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--xp-ink)' }}>
        <p style={{ margin: 0 }}>
          Rail collapses to 56px on <Kbd size="sm">⌘\</Kbd>. State persists per workspace,
          not per device — sign-in on a fresh laptop should feel like coming home, not setting up.
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--xp-muted)' }}>
          Width values are remembered in the workspace settings table; client-side persisted via
          xstate machine for the open-on-load case.
        </p>
      </div>

      <hr className="xp-rule-dashed" style={{ margin: 0 }} />

      {/* Activity */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name="Theo Wynn" size={18} />
          <span style={{ fontSize: 11.5, flex: 1 }}>
            <strong style={{ fontWeight: 600 }}>T. WYNN</strong>
            <span className="xp-muted"> changed estimate </span>
            <span className="xp-mono">3 → 5</span>
          </span>
          <span className="xp-mono xp-muted" style={{ fontSize: 10.5 }}>14m</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name="Ada Okafor" size={18} />
          <span style={{ fontSize: 11.5, flex: 1 }}>
            <strong style={{ fontWeight: 600 }}>A. OKAFOR</strong>
            <span className="xp-muted"> assigned to </span>
            <strong style={{ fontWeight: 600 }}>L. PARK</strong>
          </span>
          <span className="xp-mono xp-muted" style={{ fontSize: 10.5 }}>1h</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Composer */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--xp-hairline)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Input placeholder="Leave a comment — ⌘+enter to send" size="sm" />
        <Button variant="primary" size="sm">SEND</Button>
      </div>
    </div>
  );
}
