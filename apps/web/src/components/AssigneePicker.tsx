// Reusable multi-assignee picker. The menu renders in a portal with fixed
// positioning so it escapes any clipping/overflow or stacking context of its
// container (XP-87: on board cards the inline dropdown was clipped by the
// column's overflow and slipped behind the next card). One component now backs
// the board card, the issue peek, and the issue detail.

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { WorkspaceUser } from '../lib/api';
import { AgentAvatar } from './AgentBadge';

const MENU_WIDTH = 200;
const MENU_MAX_HEIGHT = 240;
const GUTTER = 8;

export function AssigneePicker({
  users,
  selectedIds,
  onChange,
  children,
  title,
  className,
  style,
}: {
  users: WorkspaceUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Trigger content (avatar stack, chips, …). */
  children: ReactNode;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Right-align the menu to the trigger, clamped into the viewport.
    let left = Math.min(r.right - MENU_WIDTH, vw - MENU_WIDTH - GUTTER);
    left = Math.max(GUTTER, left);
    // Prefer below; flip above if it would overflow the bottom edge.
    const below = r.bottom + 4;
    const top = below + MENU_MAX_HEIGHT > vh - GUTTER
      ? Math.max(GUTTER, r.top - 4 - MENU_MAX_HEIGHT)
      : below;
    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReflow = () => place();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, place]);

  const selected = new Set(selectedIds);
  const toggle = (id: string) => {
    const next = selected.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-assignee-picker
        title={title}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          ...style,
        }}
      >
        {children}
      </button>
      {open && coords &&
        createPortal(
          <div
            ref={menuRef}
            data-assignee-picker-menu
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: MENU_WIDTH,
              maxHeight: MENU_MAX_HEIGHT,
              overflowY: 'auto',
              zIndex: 1000,
              // XP-97: re-enable pointer events — a modal Radix dialog (the peek)
              // sets pointer-events:none on body, which this portaled menu would
              // otherwise inherit, making the rows unclickable.
              pointerEvents: 'auto',
              background: 'var(--xp-surface)',
              border: '1px solid var(--xp-border)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              padding: '4px 0',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 12,
            }}
          >
            <Row
              active={selectedIds.length === 0}
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 'var(--xp-r-sm)',
                  border: '1px dashed var(--xp-muted)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--xp-muted)' }}>Unassigned</span>
            </Row>
            {users.map((u) => {
              const name = u.displayName ?? u.email;
              return (
                <Row key={u.id} active={selected.has(u.id)} onClick={() => toggle(u.id)}>
                  <AgentAvatar name={name} src={u.avatarUrl ?? undefined} size={18} isAgent={u.isAgent} harness={u.agentHarness} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </Row>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

function Row({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--xp-layer)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
      {active && <span style={{ marginLeft: 'auto', fontSize: 11 }}>&#10003;</span>}
    </div>
  );
}

// Avatar stack used as the picker trigger on board cards (and reusable elsewhere).
export function AssigneeStack({
  assignees,
  size = 20,
}: {
  assignees: WorkspaceUser[];
  size?: number;
}) {
  if (assignees.length === 0) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 'var(--xp-r-sm)',
          border: '1.5px dashed var(--xp-faint)',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {assignees.slice(0, 3).map((u, i) => {
        const n = u.displayName ?? u.email;
        return (
          <div
            key={u.id}
            style={{
              // XP-87: shape must match the inner Avatar (rounded-xp-sm) — a
              // mismatched circular wrapper drew a ghost ring around the
              // square-rounded avatar, most visible on overlapped stacks.
              marginLeft: i === 0 ? 0 : -6,
              borderRadius: 'var(--xp-r-sm)',
              boxShadow: '0 0 0 1.5px var(--xp-surface)',
              display: 'inline-flex',
              zIndex: assignees.length - i,
            }}
          >
            <AgentAvatar name={n} src={u.avatarUrl ?? undefined} size={size} isAgent={u.isAgent} harness={u.agentHarness} />
          </div>
        );
      })}
      {assignees.length > 3 && (
        <span
          style={{
            marginLeft: -6,
            width: size,
            height: size,
            borderRadius: 'var(--xp-r-sm)',
            background: 'var(--xp-layer)',
            boxShadow: '0 0 0 1.5px var(--xp-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--xp-muted)',
          }}
        >
          +{assignees.length - 3}
        </span>
      )}
    </div>
  );
}
