// apps/web/src/components/CommandPalette.tsx
//
// PER-58 (palette-first pass). Real issue search via /v1/issues, recent
// issues from localStorage, sectioned nav + actions, DS-themed.

import {
  Avatar,
  CloseEsc,
  IssueKey,
  Kbd,
  Priority,
  StateDot,
  type WorkflowState as StateKind,
} from '@xpntl/ui';
import { AgentAvatar } from './AgentBadge';
import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Issue, type WorkflowState, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { priorityKind } from '../lib/format';
import { usePalette } from '../lib/palette-store';
import { type RecentIssue, listRecentIssues } from '../lib/recent-issues';
import { SHORTCUT_PALETTE, useShortcut } from '../lib/shortcuts';
import { nameForUser, useUsers } from '../lib/user-store';

const QUERY_MIN_CHARS_FOR_SERVER = 2;

export function CommandPalette() {
  const navigate = useNavigate();
  const { token, clear } = useAuth();
  const usersById = useUsers((s) => s.byId);

  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const toggle = usePalette((s) => s.toggle);
  const [query, setQuery] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [recents, setRecents] = useState<RecentIssue[]>([]);

  useShortcut(SHORTCUT_PALETTE, () => toggle(), { ignoreInputs: false });
  useShortcut('escape', () => setOpen(false), { enabled: open, ignoreInputs: false });

  // Reset query each time we close so re-opens start fresh.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Lock body scroll while open; load recents from localStorage on open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    setRecents(listRecentIssues());
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Load workflow states + initial issues on first open (cached for the session).
  useEffect(() => {
    if (!open) return;
    if (states.length === 0) {
      api
        .listWorkflowStates(token)
        .then((r) => setStates(r.states))
        .catch(() => {});
    }
    if (issues.length === 0) {
      api
        .listIssues({}, token)
        .then((r) => setIssues(r.issues))
        .catch(() => {});
    }
  }, [open, token, states.length, issues.length]);

  // Server-side search when query >= 2 chars. Debounced via timer cancel.
  useEffect(() => {
    if (!open) return;
    if (query.length < QUERY_MIN_CHARS_FOR_SERVER) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      api
        .listIssues({ q: query }, token)
        .then((r) => {
          if (cancelled) return;
          setIssues(r.issues);
        })
        .catch(() => {});
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, token]);

  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'var(--xp-overlay)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <Command
        label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'var(--xp-surface)',
          border: '1px solid var(--xp-border)',
          borderRadius: 'var(--xp-r-sm)',
          boxShadow: 'var(--xp-shadow-3)',
          fontFamily: 'var(--xp-font-mono)',
          color: 'var(--xp-ink)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid var(--xp-hairline)',
          }}
        >
          <span style={{ color: 'var(--xp-muted)', fontSize: 13 }}>⌕</span>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Type a command or search for an issue"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 13,
              color: 'var(--xp-ink)',
              letterSpacing: 'var(--xp-track-snug)',
            }}
          />
          <CloseEsc aria-label="Close command palette" onClick={() => setOpen(false)} />
        </div>

        <Command.List
          style={{
            maxHeight: '60vh',
            overflowY: 'auto',
            padding: 6,
            scrollbarWidth: 'none',
          }}
        >
          <Command.Empty
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--xp-muted)',
              fontSize: 12,
            }}
          >
            No matches.
          </Command.Empty>

          {query.length === 0 && recents.length > 0 && (
            <PaletteGroup heading="RECENT">
              {recents.map((r) => (
                <IssueRow
                  key={`recent-${r.key}`}
                  onSelect={run(() => navigate(`/issues/${encodeURIComponent(r.key)}`))}
                  issueKey={r.key}
                  title={r.title}
                />
              ))}
            </PaletteGroup>
          )}

          {issues.length > 0 && (
            <PaletteGroup heading={query ? 'ISSUES' : 'ALL ISSUES'}>
              {issues.slice(0, 12).map((iss) => {
                const state = stateById.get(iss.stateId);
                const stateKind: StateKind = (state?.type as StateKind) ?? 'unstarted';
                return (
                  <IssueRow
                    key={iss.id}
                    onSelect={run(() => navigate(`/issues/${encodeURIComponent(iss.key)}`))}
                    issueKey={iss.key}
                    title={iss.title}
                    stateKind={stateKind}
                    priority={iss.priority}
                    assigneeName={
                      iss.assigneeId ? nameForUser(iss.assigneeId, usersById) : undefined
                    }
                    assigneeAvatarUrl={
                      iss.assigneeId ? usersById[iss.assigneeId]?.avatarUrl ?? undefined : undefined
                    }
                    assigneeIsAgent={iss.assigneeId ? usersById[iss.assigneeId]?.isAgent : undefined}
                    assigneeHarness={iss.assigneeId ? usersById[iss.assigneeId]?.agentHarness : undefined}
                  />
                );
              })}
            </PaletteGroup>
          )}

          <PaletteGroup heading="NAVIGATE">
            <NavRow label="All issues" hint="G L" onSelect={run(() => navigate('/issues'))} />
            <NavRow
              label="My issues"
              hint="G M"
              onSelect={run(() => navigate('/issues?assignee=me'))}
            />
            <NavRow
              label="Active"
              hint="G A"
              onSelect={run(() => navigate('/issues?stateType=started'))}
            />
            <NavRow
              label="Backlog"
              hint="G B"
              onSelect={run(() => navigate('/issues?stateType=backlog'))}
            />
            <NavRow label="Urgent issues" onSelect={run(() => navigate('/issues?priority=1'))} />
          </PaletteGroup>

          <PaletteGroup heading="ACTIONS">
            <NavRow
              label="Create new issue"
              hint="C"
              onSelect={run(() => navigate('/issues?create=1'))}
            />
          </PaletteGroup>

          <PaletteGroup heading="SESSION">
            <NavRow
              label="Sign out"
              onSelect={run(async () => {
                try {
                  await api.logout(token);
                } finally {
                  clear();
                  navigate('/signin');
                }
              })}
            />
          </PaletteGroup>
        </Command.List>
      </Command>
    </div>
  );
}

function PaletteGroup({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group heading={heading} style={{ padding: '4px 4px 8px' }}>
      <style>{`[cmdk-group-heading] {
        font-family: var(--xp-font-mono);
        font-size: 10px;
        letter-spacing: var(--xp-track-meta);
        text-transform: uppercase;
        color: var(--xp-muted);
        padding: 6px 10px 4px;
      }
      [cmdk-item][data-selected="true"] {
        background: var(--xp-layer);
      }`}</style>
      {/* Wrapped in a fragment to bridge a @types/react version mismatch between
          the app and cmdk (the app's ReactNode includes bigint; cmdk's doesn't). */}
      <>{children}</>
    </Command.Group>
  );
}

function NavRow({
  label,
  hint,
  onSelect,
}: {
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        height: 28,
        borderRadius: 'var(--xp-r-sm)',
        cursor: 'pointer',
        fontSize: 12.5,
        color: 'var(--xp-ink)',
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <Kbd size="sm">{hint}</Kbd>}
    </Command.Item>
  );
}

function IssueRow({
  issueKey,
  title,
  stateKind,
  priority,
  assigneeName,
  assigneeAvatarUrl,
  assigneeIsAgent,
  assigneeHarness,
  onSelect,
}: {
  issueKey: string;
  title: string;
  stateKind?: StateKind;
  priority?: number;
  assigneeName?: string;
  assigneeAvatarUrl?: string;
  assigneeIsAgent?: boolean;
  assigneeHarness?: string | null;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`${issueKey} ${title}`}
      onSelect={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        height: 28,
        borderRadius: 'var(--xp-r-sm)',
        cursor: 'pointer',
        fontSize: 12.5,
        color: 'var(--xp-ink)',
      }}
    >
      {stateKind && <StateDot kind={stateKind} size={12} />}
      <span style={{ width: 72, flex: 'none' }}>
        <IssueKey size="sm">{issueKey}</IssueKey>
      </span>
      {priority !== undefined && priority > 0 && (
        <Priority kind={priorityKind(priority)} size={12} />
      )}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: 'var(--xp-track-snug)',
        }}
      >
        {title}
      </span>
      {assigneeName && <AgentAvatar name={assigneeName} src={assigneeAvatarUrl} size={18} isAgent={assigneeIsAgent} harness={assigneeHarness} />}
    </Command.Item>
  );
}
