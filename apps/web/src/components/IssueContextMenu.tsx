import {
  ContextMenu,
  type ContextMenuItem,
  Priority,
  StateDot,
  type WorkflowState as StateKind,
} from '@xpntl/ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Issue, Label, WorkflowState } from '../lib/api';
import type { WorkspaceUser } from '../lib/api';
import { PRIORITY_LABELS, priorityKind } from '../lib/format';

export type ContextMenuPosition = { x: number; y: number };

export type IssueContextMenuState = {
  position: ContextMenuPosition;
  issue: Issue;
  isBulk: boolean;
  selectedCount: number;
} | null;

export function useIssueContextMenu() {
  const [menu, setMenu] = useState<IssueContextMenuState>(null);

  const open = useCallback((e: React.MouseEvent, issue: Issue, selectedIds: Set<string>) => {
    e.preventDefault();
    e.stopPropagation();
    const isBulk = selectedIds.size > 1 && selectedIds.has(issue.id);
    setMenu({
      position: { x: e.clientX, y: e.clientY },
      issue,
      isBulk,
      selectedCount: isBulk ? selectedIds.size : 1,
    });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, close };
}

export function IssueContextMenuPortal({
  menu,
  onClose,
  states,
  users,
  favoriteIds,
  onOpen,
  onOpenNewTab,
  onCopyLink,
  onCopyKey,
  onSetState,
  onSetPriority,
  onSetAssignee,
  labels,
  onToggleLabel,
  onToggleBlocked,
  onToggleFavorite,
  onDelete,
}: {
  menu: NonNullable<IssueContextMenuState>;
  onClose: () => void;
  states: WorkflowState[];
  users: WorkspaceUser[];
  favoriteIds: Set<string>;
  onOpen: (issue: Issue) => void;
  onOpenNewTab: (issue: Issue) => void;
  onCopyLink: (issue: Issue) => void;
  onCopyKey: (issue: Issue) => void;
  onSetState: (stateId: string) => void;
  onSetPriority: (priority: number) => void;
  onSetAssignee: (assigneeId: string | null) => void;
  labels?: Label[];
  onToggleLabel?: (labelId: string, attach: boolean) => void;
  onToggleBlocked: (issue: Issue) => void;
  onToggleFavorite: (issue: Issue) => void;
  onDelete: (issue: Issue) => void;
}) {
  const navigate = useNavigate();
  const [submenu, setSubmenu] = useState<'state' | 'priority' | 'assignee' | 'label' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);

  useEffect(() => {
    function handleClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleScroll() {
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (submenu) {
          setSubmenu(null);
        } else {
          onClose();
        }
        e.preventDefault();
      }
    }
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, submenu]);

  const isFav = favoriteIds.has(`issue:${menu.issue.id}`);
  const label = menu.isBulk ? `${menu.selectedCount} issues` : menu.issue.key;

  const { x, y } = menu.position;
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // Measure the actual rendered menu and clamp it fully into the viewport.
  // A fixed height estimate clipped the bottom items (e.g. Delete) when the
  // menu opened near the bottom edge — i.e. right-clicking the last card on
  // the board. Runs pre-paint so there's no flicker. submenu is a dep so it
  // re-measures when the menu's size changes between submenus.
  // biome-ignore lint/correctness/useExhaustiveDependencies: submenu intentionally re-triggers the measure
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    });
  }, [x, y, submenu]);

  if (submenu === 'state') {
    const items: ContextMenuItem[] = states.map((s) => ({
      label: s.name,
      leading: <StateDot kind={(s.type as StateKind) ?? 'unstarted'} size={10} />,
      onClick: () => {
        onSetState(s.id);
        onClose();
      },
    }));
    return createPortal(
      <div ref={menuRef} style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}>
        <SubmenuHeader label="Set state" onBack={() => setSubmenu(null)} />
        <ContextMenu items={items} />
      </div>,
      document.body,
    );
  }

  if (submenu === 'priority') {
    const items: ContextMenuItem[] = [0, 1, 2, 3, 4].map((p) => ({
      label: PRIORITY_LABELS[p] ?? `P${p}`,
      leading: <Priority kind={priorityKind(p)} size={10} />,
      onClick: () => {
        onSetPriority(p);
        onClose();
      },
    }));
    return createPortal(
      <div ref={menuRef} style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}>
        <SubmenuHeader label="Set priority" onBack={() => setSubmenu(null)} />
        <ContextMenu items={items} />
      </div>,
      document.body,
    );
  }

  if (submenu === 'assignee') {
    const items: ContextMenuItem[] = [
      {
        label: 'No assignee',
        leading: (
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '1px dashed var(--xp-muted)',
              display: 'inline-block',
            }}
          />
        ),
        onClick: () => {
          onSetAssignee(null);
          onClose();
        },
      },
      ...users.map((u) => ({
        label: u.displayName ?? u.email,
        onClick: () => {
          onSetAssignee(u.id);
          onClose();
        },
      })),
    ];
    return createPortal(
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          zIndex: 9999,
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        <SubmenuHeader label="Set assignee" onBack={() => setSubmenu(null)} />
        <ContextMenu items={items} />
      </div>,
      document.body,
    );
  }

  if (submenu === 'label' && labels && onToggleLabel) {
    const attachedIds = new Set((menu.issue.labels ?? []).map((l) => l.id));
    const items: ContextMenuItem[] = labels.map((l) => ({
      label: l.name,
      leading: (
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: 999, background: l.color, flexShrink: 0 }}
        />
      ),
      trailing: attachedIds.has(l.id) ? (
        <span style={{ fontSize: 10, color: 'var(--xp-accent-strong)' }}>✓</span>
      ) : undefined,
      onClick: () => {
        onToggleLabel(l.id, !attachedIds.has(l.id));
      },
    }));
    return createPortal(
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          zIndex: 9999,
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        <SubmenuHeader label="Toggle label" onBack={() => setSubmenu(null)} />
        <ContextMenu items={items} />
      </div>,
      document.body,
    );
  }

  const mainItems: ContextMenuItem[] = [
    {
      label: menu.isBulk ? `Open first (${menu.issue.key})` : 'Open issue',
      kbd: 'Enter',
      onClick: () => {
        navigate(`/issues/${encodeURIComponent(menu.issue.key)}/full`);
        onClose();
      },
    },
    {
      label: 'Open in new tab',
      onClick: () => {
        onOpenNewTab(menu.issue);
        onClose();
      },
    },
    { divider: true },
    {
      label: 'Copy link',
      onClick: () => {
        onCopyLink(menu.issue);
        onClose();
      },
    },
    {
      label: 'Copy key',
      onClick: () => {
        onCopyKey(menu.issue);
        onClose();
      },
    },
    { divider: true },
    {
      label: 'Set state',
      kbd: 'S',
      leading: <StateDot kind="started" size={10} />,
      onClick: () => setSubmenu('state'),
    },
    {
      label: 'Set priority',
      kbd: 'P',
      leading: <Priority kind="normal" size={10} />,
      onClick: () => setSubmenu('priority'),
    },
    {
      label: 'Set assignee',
      kbd: 'A',
      onClick: () => setSubmenu('assignee'),
    },
    ...(labels && onToggleLabel
      ? [
          {
            label: 'Add label',
            kbd: 'L',
            leading: (
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  border: '1px solid var(--xp-muted)',
                }}
              />
            ),
            onClick: () => setSubmenu('label'),
          } as ContextMenuItem,
        ]
      : []),
    { divider: true },
    {
      // XP-100: blocked state is the only board signal painted in --xp-danger
      // (red card border); mirror that here so the menu reads at a glance.
      label: menu.issue.blocked
        ? menu.isBulk
          ? `Unblock ${menu.selectedCount}`
          : 'Unblock'
        : menu.isBulk
          ? `Block ${menu.selectedCount}`
          : 'Block',
      kbd: 'B',
      leading: (
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 'var(--xp-r-sm)',
            border: `1.5px solid ${menu.issue.blocked ? 'var(--xp-faint)' : 'var(--xp-danger)'}`,
          }}
        />
      ),
      onClick: () => {
        onToggleBlocked(menu.issue);
        onClose();
      },
    },
    {
      label: isFav ? 'Unfavorite' : 'Favorite',
      leading: <span>{isFav ? '★' : '☆'}</span>,
      onClick: () => {
        onToggleFavorite(menu.issue);
        onClose();
      },
    },
    { divider: true },
    {
      label: menu.isBulk ? `Delete ${menu.selectedCount} issues` : 'Delete issue',
      destructive: true,
      onClick: () => {
        onDelete(menu.issue);
        onClose();
      },
    },
  ];

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 9999,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '4px 8px',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 10,
          color: 'var(--xp-muted)',
          letterSpacing: 'var(--xp-track-caps)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <ContextMenu items={mainItems} />
    </div>,
    document.body,
  );
}

function SubmenuHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '4px 8px',
        background: 'transparent',
        border: 0,
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 10,
        color: 'var(--xp-muted)',
        cursor: 'pointer',
        letterSpacing: 'var(--xp-track-caps)',
        textTransform: 'uppercase',
      }}
    >
      <span>←</span> {label}
    </button>
  );
}
