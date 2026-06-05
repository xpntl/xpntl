// packages/ui/src/screens/SidebarShell.tsx
//
// PER-103 — Sidebar shell.
// Workspace header, primary nav, project tree, user footer. Collapse-aware
// via the `collapsed` prop; toggle in product on ⌘\. Persist state per
// workspace, not per device.

import { useState, type ReactNode } from 'react';
import { Avatar } from '../primitives/Avatar';
import { IssueKey } from '../primitives/IssueKey';
import { StateDot, type WorkflowState } from '../primitives/StateDot';
import { Kbd } from '../primitives/Kbd';

export interface SidebarShellProps {
  collapsed?: boolean;
}

interface NavIconProps { kind: 'inbox' | 'my' | 'active' | 'backlog'; size?: number }
function NavIcon({ kind, size = 14 }: NavIconProps) {
  const props = {
    width: size, height: size, viewBox: '0 0 14 14',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.2,
    strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const,
    style: { flex: 'none' as const },
  };
  if (kind === 'inbox') return (
    <svg {...props}>
      <path d="M2 8.5V11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" />
      <path d="M2 8.5 3.4 3.5A1 1 0 0 1 4.4 2.8h5.2a1 1 0 0 1 1 .7L12 8.5" />
      <path d="M2 8.5h3l.7 1.4h2.6L9 8.5h3" />
    </svg>
  );
  if (kind === 'my') return (
    <svg {...props}>
      <circle cx="7" cy="5" r="2.2" />
      <path d="M2.8 12c0-2.2 1.9-3.4 4.2-3.4S11.2 9.8 11.2 12" />
    </svg>
  );
  if (kind === 'active') return (
    <svg {...props}>
      <circle cx="7" cy="7" r="4.4" />
      <path d="M7 7 L7 2.6 A4.4 4.4 0 0 1 10.7 7.7 Z" fill="currentColor" stroke="none" />
    </svg>
  );
  return (
    <svg {...props}>
      <line x1="2.8" y1="4"  x2="11.2" y2="4" />
      <line x1="2.8" y1="7"  x2="11.2" y2="7" />
      <line x1="2.8" y1="10" x2="8.5"  y2="10" />
    </svg>
  );
}

interface NavItem { id: 'inbox' | 'my' | 'active' | 'backlog'; label: string; count: number; kbd: string }
const NAV: NavItem[] = [
  { id: 'inbox',   label: 'Inbox',     count: 3,  kbd: 'I' },
  { id: 'my',      label: 'My issues', count: 12, kbd: 'M' },
  { id: 'active',  label: 'Active',    count: 28, kbd: 'A' },
  { id: 'backlog', label: 'Backlog',   count: 91, kbd: 'B' },
];

interface ProjectIssue { key: string; label: string; state: WorkflowState; selected?: boolean }
interface Project { id: string; label: string; code: string; count: number; issues?: ProjectIssue[] }

const PROJECTS: Project[] = [
  { id: 'perimeter', label: 'Perimeter', code: 'PER', count: 41, issues: [
    { key: 'PER-103', label: 'Sidebar shell',   state: 'started',   selected: true },
    { key: 'PER-106', label: 'Slide-over peek', state: 'unstarted' },
    { key: 'PER-107', label: 'Avatar fallback', state: 'unstarted' },
  ]},
  { id: 'auth', label: 'Auth', code: 'AUT', count: 17, issues: [
    { key: 'AUT-44', label: 'SSO is free, forever', state: 'completed' },
    { key: 'AUT-49', label: 'JIT regression',        state: 'canceled' },
  ]},
  { id: 'command',   label: 'Command',   code: 'CMD', count: 8 },
  { id: 'marketing', label: 'Marketing', code: 'MKT', count: 4 },
];

export function SidebarShell({ collapsed = false }: SidebarShellProps) {
  const [section, setSection] = useState<NavItem['id']>('my');
  const [openProj, setOpenProj] = useState<Record<string, boolean>>({ perimeter: true, auth: true });
  const w = collapsed ? 56 : 240;
  return (
    <div style={{
      width: w, height: '100%',
      background: 'var(--xp-surface)', color: 'var(--xp-ink)',
      borderRight: '1px solid var(--xp-border)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--xp-font-mono)', fontSize: 12.5,
      transition: 'width var(--xp-dur-base) var(--xp-ease)',
      overflow: 'hidden',
    }}>
      {/* Workspace */}
      <div style={{
        height: 44, borderBottom: '1px solid var(--xp-hairline)',
        display: 'flex', alignItems: 'center', padding: collapsed ? '0' : '0 12px',
        justifyContent: collapsed ? 'center' : 'flex-start', gap: 10,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 'var(--xp-r-sm)',
          background: 'var(--xp-ink)', color: 'var(--xp-canvas)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13, lineHeight: 1,
        }}>x</div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>perimeter.dev</div>
              <div className="xp-meta" style={{ marginTop: 1 }}>WS-041 · 41 USERS</div>
            </div>
            <Kbd size="sm">⌘K</Kbd>
          </>
        )}
      </div>

      {/* Primary nav */}
      <div style={{ padding: '8px 6px 4px' }}>
        {NAV.map(it => {
          const sel = section === it.id;
          return (
            <div
              key={it.id}
              onClick={() => setSection(it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '0' : '0 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                height: 28, position: 'relative', cursor: 'pointer',
                background: sel ? 'var(--xp-layer)' : 'transparent',
                borderRadius: 'var(--xp-r-sm)',
              }}
            >
              {sel && <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2, background: 'var(--xp-accent-strong)' }} />}
              <span style={{
                width: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: sel ? 'var(--xp-accent-strong)' : 'var(--xp-muted)',
              }}>
                <NavIcon kind={it.id} />
              </span>
              {!collapsed && <>
                <span style={{ flex: 1, fontWeight: sel ? 600 : 500 }}>{it.label}</span>
                <span className="xp-mono xp-muted" style={{ fontSize: 11 }}>{String(it.count).padStart(2, '0')}</span>
                <span style={{
                  fontFamily: 'var(--xp-font-mono)', fontSize: 9.5,
                  letterSpacing: 'var(--xp-track-caps)',
                  color: 'var(--xp-faint)', minWidth: 10, textAlign: 'right',
                }}>{it.kbd}</span>
              </>}
            </div>
          );
        })}
      </div>

      {/* Projects */}
      {!collapsed && (
        <div style={{ padding: '12px 6px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 6px' }}>
            <span className="xp-meta">PROJECTS</span>
            <span style={{ flex: 1, height: 1, background: 'var(--xp-hairline)' }} />
            <span className="xp-mono xp-muted" style={{ fontSize: 9.5 }}>04/04</span>
          </div>
          {PROJECTS.map(p => (
            <div key={p.id}>
              <div
                onClick={() => p.issues && setOpenProj(s => ({ ...s, [p.id]: !s[p.id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
                  height: 26, cursor: p.issues ? 'pointer' : 'default',
                }}
              >
                <span style={{ width: 10, fontSize: 9, color: 'var(--xp-muted)' }}>
                  {p.issues ? (openProj[p.id] ? '▾' : '▸') : ''}
                </span>
                <IssueKey size="sm">{p.code}</IssueKey>
                <span style={{ flex: 1, fontSize: 12 }}>{p.label}</span>
              </div>
              {p.issues && openProj[p.id] && p.issues.map(iss => (
                <div
                  key={iss.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 10px 0 28px', height: 24, position: 'relative',
                    background: iss.selected ? 'var(--xp-layer)' : 'transparent',
                    borderRadius: 'var(--xp-r-sm)',
                  }}
                >
                  {iss.selected && <span style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: 2, background: 'var(--xp-accent-strong)' }} />}
                  <StateDot kind={iss.state} size={12} />
                  <IssueKey size="sm">{iss.key}</IssueKey>
                  <span style={{
                    flex: 1, fontSize: 11.5, color: 'var(--xp-ink)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{iss.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--xp-hairline)',
        padding: collapsed ? '8px 0' : '8px 12px',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start', gap: 10,
      }}>
        <Avatar name="Lena Park" size={24} />
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600 }}>L. PARK</div>
              <div className="xp-meta" style={{ marginTop: 1 }}>USR-0148 · ADMIN</div>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'var(--xp-success)', fontSize: 9,
              letterSpacing: 'var(--xp-track-caps)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--xp-success)' }} />
              SYNC
            </span>
          </>
        )}
      </div>
    </div>
  );
}
